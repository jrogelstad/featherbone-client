﻿drop function if exists fp.init();

create or replace function fp.init() returns void as $$
  return (function () {

    // ..........................................................
    // NATIVES
    //

    Object.prototype.isString = function () {
      return toString.call(this) === "[object String]";
    }

    /**
      Return the text after the first dot.
    */
    String.prototype.hind = function () {
      return this.replace(/\w+\./i, '');
    }

    /**
      Return the text before the first dot.
    */
    String.prototype.ere = function () {
      return this.replace(/\.\w+/i, '');
    }

    /**
       Change sting with underscores '_' to camel case.
       @returns {String}
    */
    String.prototype.toCamelCase = function () {
      return this.replace (/(?:^|[-_])(\w)/g, function (_, c) {
        return c ? c.toUpperCase() : '';
      })
    }

    /**
       Change a camel case string to snake case.
       @returns {String} The argument modified
    */
    String.prototype.toSnakeCase = function () {
      return this.replace((/([a-z])([A-Z])/g), '$1_$2').toLowerCase();
    }

    // ..........................................................
    // FP
    //

    plv8.FP = FP = {};

    /**
      Alter a persistence class.

      {
         "nameSpace": "FP",
         "className": "Contact",
         "properties": [
           {
             "action": "add",
             "name": "name",
             "dataType": "String",
             "isRequired": true,
             "defaultValue": ""
           },
           {
             "name": "birthDate",
             "dataType": "Date"
           },
           {
             "name": "married",
             "dataType": "Boolean",
             "isRequired": true
           },
           {
             "name": "dependents",
             "dataType": "Number",
             "isRequired": true,
             "defaultValue": 0
           }
         ]
      }

     * @param {Object} Specification to alter class.
     * @return {String}
    */
    FP.alterClass = function (obj) {
      obj = obj || {};

      var schema = obj.nameSpace || 'fp',
        table = obj.className ? obj.className.toSnakeCase() : false,
        sql = 'select * from pg_tables where schemaname = $1 and tablename = $2;',
        args = [schema, table],
        result = true,
        i;

      if (!table || !obj.properties || !obj.properties.length ||
        !plv8.execute(sql, [schema, table]).length) { 
        return false 
      };

      sql = "";
      for (i = 0; i < obj.properties.length; i++) {
        var prop = obj.properties[i],
          action = prop.action || "add",
          dataType = prop.dataType,
          name = prop.name ? prop.name.toSnakeCase() : false,
          args = [schema, table, action],
          actions = ["add", "drop"],
          dataTypes = {
            Object: "json", 
            Array: "json", 
            String: "text", 
            Number: "numeric", 
            Date: "timestamp with time zone",
            Boolean: "boolean"
          };

        if (!name || actions.indexOf(action) === -1) {
          result = false;
          break;
        }
 
        sql += FP.formatSql("alter table %I.%I %I column ", args);

        /** Add to this switch to add support for more alter actions in the future**/
        switch (action)
        {
        case "add":
          if (Object.keys(dataTypes).indexOf(dataType) === -1) {
            result = false;
          } else {
            sql += FP.formatSql("%I " + dataTypes[dataType], [name]);
            if (prop.isRequired) { sql += " not null" }
            sql += ";";
          }
          break;
        case "drop":
          sql += FP.formatSql(" if exists %I;", [name]);
          break;
        }
        if (!result) { break }
      }

      if (result) { plv8.execute(sql); }

      return result;
    };

    /**
      Create a new table.
     * @param {Object} Specification to create a table.
     * @return {String}
    */
    FP.createClass = function (obj) {
      obj = obj || {};

      var schema = obj.nameSpace || 'fp',
        table = obj.className ? obj.className.toSnakeCase() : false,
        inheritSchema = (obj.inherits ? obj.inherits.ere() || "fp" : "fp").toSnakeCase(),
        inheritTable = (obj.inherits ? obj.inherits.hind() : 'object').toSnakeCase(),
        sql = "select * from pg_tables where schemaname = $1 and tablename = $2;",
        args = [schema, table, inheritSchema, inheritTable, table + "_pkey", table + "_guid_key"];

      if (!table || plv8.execute(sql, [schema, table]).length) { return false };

      sql = FP.formatSql("create table %I.%I(constraint %I primary key (id), constraint %I unique (guid)) inherits (%I.%I)", args);
      plv8.execute(sql);

      FP.alterClass(obj);
      
      return true;
    };

    /**
      Return a universally unique identifier.

      From http://stackoverflow.com/a/8809472/251019
      @return {String}
    */
    FP.createUuid = function () {
      var d = new Date().getTime(),
        uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (d + Math.random() * 16) % 16 | 0;
          d = Math.floor(d / 16);
          return (c === 'x' ? r : (r&0x7|0x8)).toString(16);
        });

      return uuid;
    };

    /**
      Drop a table.

      * @param {Object} Table to drop.
      * @return {String}
    */
    FP.destroyClass = function (obj) {
      obj = obj || {};

      var schema = (obj.nameSpace || 'fp').toSnakeCase(),
        table = obj.className ? obj.className.toSnakeCase() : false,
        sql = "select * from pg_tables where schemaname = $1 and tablename = $2;",
        args = [schema, table];

      if (!table || !plv8.execute(sql, args).length) { return false };

      sql = FP.formatSql("drop table %I.%I", args);
      plv8.execute(sql);
      
      return true;
    };

    /**
     * Escape strings to prevent sql injection
       http://www.postgresql.org/docs/9.1/interactive/functions-string.html#FUNCTIONS-STRING-OTHER
     *
     * @param {String} A string with tokens to replace.
     * @param {Array} Array of replacement strings.
     * @return {String} Escaped string.
    */
    FP.formatSql = function (str, ary) {
      var params = [],
        i;

      ary = ary || [];
      ary.unshift(str);
      for (i = 0; i < ary.length; i++) {
        params.push("$" + (i + 1));
      };

      return plv8.execute("select format(" + params.toString(",") + ")", ary)[0].format;
    }

    /**
      Return a the current user.

      @return {String}
    */
    FP.getCurrentUser = function () {

      return plv8.execute("select current_user as user")[0].user;
    }

    plv8._init = true;

  }());
$$ language plv8;
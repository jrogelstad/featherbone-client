﻿/**
    Featherbonejs is a JavaScript based persistence framework for building object relational database applications
    
    Copyright (C) 2015  John Rogelstad
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

create or replace function fp.load_fp() returns void as $$
  return (function () {
    plv8.FP = FP = {};

    var _camelize,
      _getKey,
      _sanitize,
      _insert,
      _select,
      _update,
      _delete;

    /**
      Return a unique identifier string.

      Moddified from https://github.com/google/closure-library/blob/555e0138c83ed54d25a3e1cd82a7e789e88335a7/closure/goog/string/string.js#L1177
      @author arv@google.com (Erik Arvidsson)
      http://www.apache.org/licenses/LICENSE-2.0
      
      @return {String}
    */
    FP.createId = function (test) {
      var x = 2147483648,
        d = new Date(),
        result = Math.floor(Math.random() * x).toString(36) +
          Math.abs(Math.floor(Math.random() * x) ^ d).toString(36);

      return _getKey(result) ? FP.createId() : result;
    };

    /**
      Remove a class from the database.

      * @param {Object} Object describing object to remove.
      * @return {String}
    */
    FP.deleteClass = function (obj) {
      obj = obj || {};

      var table = obj.className ? obj.className.toSnakeCase() : false,
        sql = "select * from pg_tables where schemaname = 'fp' and tablename = $1;",
        args = [table];

      if (!table || !plv8.execute(sql, args).length) { return false };

      sql = FP.format("drop table fp.%I", args);
      plv8.execute(sql);
      
      return true;
    };

    /**
      Return the current user.

      @return {String}
    */
    FP.getCurrentUser = function () {
      return plv8.execute("select current_user as user;")[0].user;
    };

    /** private
     * Escape strings to prevent sql injection
       http://www.postgresql.org/docs/9.1/interactive/functions-string.html#FUNCTIONS-STRING-OTHER
     *
     * @param {String} A string with tokens to replace.
     * @param {Array} Array of replacement strings.
     * @return {String} Escaped string.
    */
    FP.format = function (str, ary) {
      var params = [],
        i = 0;

      ary = ary || [];
      ary.unshift(str);

      while (i++ < ary.length) {
        params.push("$" + (i));
      };

      return plv8.execute("select format(" + params.toString(",") + ")", ary)[0].format;
    };

    /**
      Post.

      Example payload:
          {
             "nameSpace": "FP",
             "className": "Contact",
             "action": "POST",
             "data": {
               "id": "1f8c8akkptfe",
               "created": "2015-04-26T12:57:57.896Z",
               "createdBy": "admin",
               "updated": "2015-04-26T12:57:57.896Z",
               "updatedBy": "admin",
               "fullName": "John Doe",
               "birthDate": "1970-01-01T00:00:00.000Z",
               "isMarried": true,
               "dependentes": 2
             }
          }

      @return {String}
    */
    FP.request = function (obj) {
      switch (obj.action)
      {
      case "GET":
        return _select(obj);
      case "POST":
        return _insert(obj);
      case "PATCH":
        return _update(obj);
      case "DELETE":
        return _delete(obj);
      }
 
    };

    /**
      Create or update a persistence class. This function is idempotent.

      Example payload:
          {
             "nameSpace": "FP",
             "className": "Contact",
             "description": "Contact data about a person",
             "properties": [
               {
                 "action": "add",
                 "name": "fullName",
                 "description": "Full name",
                 "type": "String",
                 "isRequired": true
               },
               {
                 "name": "birthDate",
                 "description": "Birth date",
                 "type": "Date"
               },
               {
                 "name": "isMarried",
                 "description": "Marriage status",
                 "type": "Boolean",
                 "isRequired": true
               },
               {
                 "name": "dependents",
                 "description": "Number of dependents",
                 "type": "Number",
                 "isRequired": true
               }
             ]
          }
 
     * @param {Object} Class specification payload.
     * @return {String}
    */
    FP.saveClass = function (obj) {
      obj = obj || {};

      var table = obj.className ? obj.className.toSnakeCase() : false,
        inheritTable = (obj.inherits ? obj.inherits.hind() : 'object').toSnakeCase(),
        sql = "select * from pg_tables where schemaname = 'fp' and tablename = $1;",
        sqlChk = "select * " +
         "from pg_class c, pg_namespace n, pg_attribute a, pg_type t " +
         "where c.relname = $1 " +
         " and n.nspname = 'fp' " +
         " and a.attname = $2 " +
         " and n.oid = c.relnamespace " +
         " and a.attnum > 0 " +
         " and a.attrelid = c.oid " +
         " and a.atttypid = t.oid; ",
        args = [table, table + "_pkey", table + "_pk_key", inheritTable],
        actions = ["add", "drop"],
        types = {
          Object: "json", 
          Array: "json", 
          String: "text", 
          Number: "numeric", 
          Date: "timestamp with time zone",
          Boolean: "boolean"
        },
        props = obj.properties,
        keys = Object.keys(props),
        result = true,
        found,
        i = 0;

      if (!table) { return false };

      /** Edit table **/
      if (!plv8.execute(sql, [table]).length) {
        sql = FP.format("create table fp.%I(constraint %I primary key (_pk), constraint %I unique (id)) inherits (fp.%I)", args);
        plv8.execute(sql);
      }

      if (obj.description) { 
        sql = FP.format("comment on table fp.%I is %L;", [table, obj.description]);
        plv8.execute(sql);
      }

      /** Edit columns **/
      /** TODO: Auto-drop not specified properties */
      while (keys[i]) {
        var prop = props[keys[i]],
          action = prop.action || "add",
          type = prop.type,
          name = keys[i].toSnakeCase(),
          args = [table, action];

        if (actions.indexOf(action) === -1) {
          result = false;
          break;
        }

        args.push(name);
        found = plv8.execute(sqlChk, [table, name]).length;

        /** Add to this switch to add support for more alter actions in the future**/
        switch (action)
        {
        case "add":
          if (Object.keys(types).indexOf(type) === -1) {
            result = false;
          } else {
            if (!found) {
              sql += FP.format("alter table fp.%I %I column %I " + types[type], args);
              sql += prop.isRequired ? " not null;" : ";";
            }
            if (prop.description) {
              sql += FP.format("comment on column fp.%I.%I is %L;", [table, name, prop.description]);
            }
          }
          break;
        case "drop":
          if (found) {
            sql += FP.format("alter table fp.%I %I column if exists %I;", args);
          }
          break;
        }
        if (!result) { break }
        i++;
      }

      if (result) { plv8.execute(sql); }

      return true;
    };

    // ..........................................................
    // Private
    //

    /** private */
    _camelize = function (obj) {
      var result = {},
        prop;

      for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          result[prop.toCamelCase()] = obj[prop];
        }
      }

      obj = result;

      return obj;
    };

    /** private */
    _delete = function (obj) {
      plv8.execute("update fp.object set is_deleted = true where id=$1;", [obj.id]);
      
      return true;
    };

    /** private */
    _insert = function (obj) {
      var data = JSON.parse(JSON.stringify(obj.data)),
        args = [obj.className.toSnakeCase()],
        tokens = [],
        params = [],
        values = [],
        i = 0,
        keys,
        sql;

      /** Check id for existence and uniqueness and regenerate if any problem */
      data.id = data.id === undefined || _getKey(data.id) !== undefined ? FP.createId() : data.id;
      keys = Object.keys(data);

      while (i < keys.length) {
        args.push(keys[i].toSnakeCase());
        tokens.push("%I");
        values.push(data[keys[i]]);
        i++;
        params.push("$" + (i));
      }

      sql = FP.format("insert into fp.%I (" + tokens.toString(",") + ") values (" + params.toString(",") + ") returning *;", args);
      result = _sanitize(plv8.execute(sql, values)[0]);
      return jsonpatch.compare(obj.data, result);
    };

    /** private */
    _getKey = function (id) {
      var result = plv8.execute("select _pk from fp.object where id = $1", [id])[0];
      return result ? result._pk : undefined;
    };

    /** private */
    _sanitize = function (obj) {
      delete obj._pk;
      obj = _camelize(obj);
      obj = JSON.parse(JSON.stringify(obj)); /** Clone to convert dates back to string */
      
      return obj;
    };

    /** private */
    _select = function (obj) {
      var table = obj.className.toSnakeCase(),
        props = obj.properties || [],
        pk = _getKey(obj.id),
        tokens = [],
        i = props.length,
        result,
        prop,
        cols,
        sql,
        i;

      if (i) {
        while (i--) {
          tokens.push('%I');
          props[i] = props[i].toSnakeCase();
        }
        cols = tokens.toString(',');
      } else {
        cols = "*";
      }
      props.push(table);
      
      sql = FP.format("select " + cols + " from fp.%I where _pk = $1", props);
      result = _sanitize(plv8.execute(sql, [pk])[0]);

      return result;
    };

    /** private */
    _update = function (obj) {
      var args = [obj.className.toSnakeCase()],
       patch = obj.data,
       i = 0;

      while (patch[i]) {
        switch (patch.op)
        {
        case "add":
          return _insert(obj);
        case "replace":
          return _update(obj);
        case "remove":
          return _delete(obj);
        default:
          return false;
        }
        i++;
      }
    };

  }());
$$ language plv8;
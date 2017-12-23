/**
    Framework for building object relational database apps
    Copyright (C) 2018  John Rogelstad

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

(function () {
  "use strict";

  var sheetConfigureDialog = {},
    m = require("mithril"),
    stream = require("stream"),
    f = require("component-core"),
    catalog = require("catalog"),
    tableDialog = require("table-dialog");

  /**
    View model for sort dialog.

    @param {Object} Options
    @param {Function} [options.config] Filter property being modified
    @param {Function} [options.filter] Filter property
  */
  sheetConfigureDialog.viewModel = function (options) {
    options = options || {};
    var vm, tableView,
      createModel = catalog.store().models().workbookLocalConfig,
      cache = f.copy(options.parentViewModel.sheet());

    options.onOk = function () {
      var route,
        id = vm.sheetId(),
        sheet = vm.model().toJSON(),
        workbook = vm.workbook();

      vm.sheet(id, sheet);
      workbook.data.localConfig(vm.config());
      f.buildRoutes(workbook.toJSON());
      route = "/" + workbook.data.name() + "/" + sheet.name;
      route = route.toSpinalCase();
      m.route.set(route);
      vm.state().send("close");
    };
    options.icon = "gear";
    options.title = "Configure worksheet";

    // ..........................................................
    // PUBLIC
    //

    vm = tableDialog.viewModel(options);
    tableView = vm.content;
    vm.addAttr = function (attr) {
      if (!this.some(vm.hasAttr.bind(attr))) {
        this.push({attr: attr});
        return true;
      }
    };
    vm.attrs = function () {
      var model = vm.model(),
        feather = catalog.getFeather(model.data.feather()),
        keys = feather ? Object.keys(feather.properties) : false;
      return  keys ? f.resolveProperties(feather, keys).sort() : [];
    };
    vm.config = options.parentViewModel.config;
    vm.content = function () {
      var feathers, forms,
        d = vm.model().data,
        ids = vm.ids(),
        nameId = ids.name,
        featherId = ids.feather,
        formId = ids.form;

      feathers = vm.feathers().map(function (feather) {
        return m("option", feather);
      });

      forms = vm.forms().map(function (form) {
        return m("option", form);
      });

      return m("div", {
        class: "pure-form pure-form-aligned suite-sheet-configure-content"
      }, [
        m("div", {class: "pure-control-group"}, [
          m("label", {
            for: nameId
          }, "Name:"),
          m("input", {
            value: d.name(),
            required: true,
            oninput: m.withAttr("value", d.name)
          })
        ]),
        m("div", {class: "pure-control-group"}, [
          m("label", {
            for: featherId
          }, "Table:"),
          m("select", {
            value: d.feather(),
            required: true,
            oninput: m.withAttr("value", d.feather)
          }, feathers)
        ]),
        m("div", {class: "pure-control-group"}, [
          m("label", {
            for: formId
          }, "Form:"),
          m("select", {
            value: vm.form(),
            required: true,
            oninput: m.withAttr("value", vm.form)
          }, forms)
        ]),
        m("div", {class: "suite-sheet-configure-tabs"} , [
          m("button", {
            class: "pure-button pure-button-primary",
            style: { borderRadius: "4px"}
          }, "List")
        ]),
        m("div", {class: "suite-sheet-configure-group-box"}, [
          tableView()
        ])
      ]);
    };
    vm.data = function () { 
      return vm.model().data.list().data.columns();
    };
    vm.hasAttr = function (item) { 
      return item.attr === this;
    };
    vm.feathers = function () {
      var feathers = catalog.data(),
        result = Object.keys(feathers).filter(function (name) {
          return !feathers[name].isChild && !feathers[name].isSystem;
        }).sort();
      return result;
    };
    vm.form = function (name) {
      var forms, form,
        prop = vm.model().data.form;
      if (arguments.length) {
        forms = catalog.store().forms();
        form = Object.keys(forms).find(function (key) {
          return forms[key].name === name;
        });
        prop(form);
      }
      return prop() ? prop().name : "";
    };
    vm.forms = function () {
      var result,
        forms = catalog.store().forms(),
        feather = vm.model().data.feather();

      // Only forms that have matching feather
      result = Object.keys(forms).filter(function (id) {
        return forms[id].feather === feather;
      });
      // Just return names
      result = result.map(function (id) {
        return forms[id].name;
      }).sort();

      return result;
    };
    vm.model = f.prop(createModel(cache));
    vm.okDisabled = function () {
      return !vm.model().isValid();
    };
    vm.okTitle = function () {
      return vm.model().lastError();
    };
    vm.sheetId = stream(options.sheetId);
    vm.relations = stream({});
    vm.reset = function () {
      var id = vm.sheetId();
      cache = f.copy(vm.sheet(id));
      vm.model(createModel(cache));
      if (!cache.list.columns.length) { vm.add(); }
      vm.selection(0);
    };
    vm.sheet = options.parentViewModel.sheet;
    vm.workbook = options.parentViewModel.workbook;
    vm.viewHeaderIds = stream({
      column: f.createId(),
      label: f.createId()
    });
    vm.viewHeaders = function () {
      var ids = vm.viewHeaderIds();
      return [
        m("th", {style: {minWidth: "165px"}, id: ids.column }, "Column"),
        m("th", {style: {minWidth: "220px"}, id: ids.label }, "Label")
      ];
    };
    vm.viewRows = function () {
      var view;

      view = vm.items().map(function (item) {
        var row;

        row = m("tr", {
          onclick: vm.selection.bind(this, item.index, true),
          style: {backgroundColor: vm.rowColor(item.index)}
        },[
          m("td", {style: {minWidth: "165px", maxWidth: "165px"}},
            m("select", {
              id: f.createId(),
              value: item.attr,
              onchange: m.withAttr(
                "value",
                vm.itemChanged.bind(this, item.index, "attr"))
            }, vm.attrs().map(function (attr) {
                return m("option", {
                  value: attr}, attr.toName());
              })
            )
          ),
          m("td", {style: {minWidth: "220px", maxWidth: "220px"}},
            m("input", {
              value: item.label || item.attr.toName(),
              onchange: m.withAttr(
                "value",
                vm.itemChanged.bind(this, item.index, "label"))
            })
          )
        ]);

        return row;
      });

      return view;
    };

    // ..........................................................
    // PRIVATE
    //

    vm.ids().name = f.createId();
    vm.ids().feather = f.createId();
    vm.ids().form = f.createId();
    vm.style().width = "510px";
    vm.reset();

    return vm;
  };

  /**
    Filter dialog component

    @params {Object} View model
  */
  sheetConfigureDialog.component = tableDialog.component;

  module.exports = sheetConfigureDialog;

}());

/*
    Framework for building object relational database apps
    Copyright (C) 2019  John Rogelstad

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
*/
/*jslint this, browser*/
import f from "../core.js";
import catalog from "../models/catalog.js";
import State from "../state.js";

const selected = f.prop();
const navigator = {};
const m = window.m;

// Define state (global)
const state = State.define(function () {
    this.state("Expanded", function () {
        this.event("toggle", function () {
            this.goto("../Collapsed");
        });
        this.classMenu = (
            "pure-menu fb-navigator-menu fb-navigator-menu-expanded"
        );
        this.classHeader = "";
        this.content = function (value) {
            return value;
        };
        this.title = function () {
            return undefined;
        };
    });
    this.state("Collapsed", function () {
        this.event("toggle", function () {
            this.goto("../Expanded");
        });
        this.classMenu = (
            "pure-menu fb-navigator-menu fb-navigator-menu-collapsed"
        );
        this.classHeader = "fb-navigator-menu-header-collapsed";
        this.content = function () {
            return undefined;
        };
        this.title = function (value) {
            return value;
        };
    });
});
state.goto();

navigator.viewModel = function (options) {
    options = options || {};
    let vm;

    // ..........................................................
    // PUBLIC
    //

    vm = {};

    vm.workbooks = catalog.store().workbooks;
    vm.goHome = function () {
        m.route.set("/home");
    };
    vm.goto = function () {
        let config = this.getConfig();

        m.route.set("/workbook/:workbook/:key", {
            workbook: this.data.name().toSpinalCase(),
            key: config[0].name.toSpinalCase()
        });
    };
    vm.itemContent = function (value) {
        return state.resolve(state.current()[0]).content(value);
    };
    vm.itemTitle = function (value) {
        return state.resolve(state.current()[0]).title(value);
    };
    vm.mouseoverKey = f.prop();
    vm.mouseout = function () {
        vm.mouseoverKey(undefined);
    };
    vm.mouseover = function () {
        vm.mouseoverKey(this);
    };
    vm.toggle = function () {
        state.send("toggle");
    };
    vm.classHeader = function () {
        return state.resolve(state.current()[0]).classHeader;
    };
    vm.classMenu = function () {
        return state.resolve(state.current()[0]).classMenu;
    };
    vm.selected = selected;
    vm.state = f.prop(state);

    // ..........................................................
    // PRIVATE
    //

    return vm;
};

// Define navigator component
navigator.component = {
    oninit: function (vnode) {
        let vm = vnode.attrs.viewModel || navigator.viewModel(vnode.attrs);
        this.viewModel = vm;
    },

    view: function () {
        let menuItems;
        let itemClass;
        let vm = this.viewModel;
        let workbooks = vm.workbooks();

        function items(key) {
            let name = workbooks[key].data.name();

            itemClass = "pure-menu-item fb-navigator-item";

            if (vm.selected() && vm.selected() === key) {
                itemClass += " fb-navigator-item-selected";
            } else if (vm.mouseoverKey() === key) {
                itemClass += " fb-navigator-item-mouseover";
            }

            return m("li", {
                class: itemClass,
                onclick: vm.goto.bind(workbooks[key]),
                onmouseover: vm.mouseover.bind(key),
                onmouseout: vm.mouseout,
                title: vm.itemTitle(name)
            }, [
                m("i", {
                    class: (
                        "fa fa-" +
                        workbooks[key].data.icon() +
                        " fb-navigator-item-icon"
                    )
                })
            ], vm.itemContent(name));
        }

        menuItems = Object.keys(workbooks).map(items);

        itemClass = "pure-menu-item fb-navigator-item";
        if (vm.selected() === "home") {
            itemClass += " fb-navigator-item-selected";
        } else if (vm.mouseoverKey() === "home") {
            itemClass += " fb-navigator-item-mouseover";
        }

        menuItems.unshift(
            m("li", {
                class: itemClass,
                onclick: vm.goHome,
                onmouseover: vm.mouseover.bind("home"),
                onmouseout: vm.mouseout,
                title: vm.itemTitle("Home")
            }, [
                m("i", {
                    class: "fa fa-home fb-navigator-item-icon"
                })
            ], vm.itemContent("Home"))
        );

        return m("div", {
            class: vm.classMenu()
        }, [
            m("div", {
                class: vm.classHeader()
            }, "Featherbone", [
                m("i", {
                    style: {
                        fontSize: "x-small",
                        marginLeft: "8px",
                        marginTop: "4px"
                    },
                    class: "fa fa-chevron-left",
                    onclick: vm.toggle
                })
            ]),
            m("ul", {
                class: "pure-menu-list"
            }, menuItems)
        ]);
    }
};

export default Object.freeze(navigator);

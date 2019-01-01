/**
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
**/
/*jslint browser*/
import {f} from "../../common/core-client.js";
import {catalog} from "../models/catalog.js";
import {stream} from "../../common/stream-client.js";

const m = window.m;
const console = window.console;

/**
  Return the matching currency object.

  @param {String} Currency code
  @return {Object}
*/
f.getCurrency = function (code) {
    return catalog.store().data().currencies().find(function (curr) {
        return (
            curr.data.code() === code || (
                curr.data.hasDisplayUnit() &&
                curr.data.displayUnit().data.code() === code
            )
        );
    });
};

/**
  Object to define what input type to use for data
*/
f.inputMap = {
    integer: "number",
    number: "text",
    string: "text",
    date: "date",
    dateTime: "datetime-local",
    boolean: "checkbox",
    password: "text",
    tel: "tel",
    email: "email",
    url: "url",
    color: "color",
    textArea: undefined,
    money: "number"
};

f.formats.money.fromType = function (value) {
    let style;
    let amount = value.amount || 0;
    let currency = value.currency;
    let curr = f.getCurrency(value.currency);
    let hasDisplayUnit = curr.data.hasDisplayUnit();
    let minorUnit = (
        hasDisplayUnit
        ? curr.data.displayUnit().data.minorUnit()
        : curr.data.minorUnit()
    );

    style = {
        minimumFractionDigits: minorUnit,
        maximumFractionDigits: minorUnit
    };

    if (hasDisplayUnit) {
        curr.data.conversions().some(function (conv) {
            if (conv.data.toUnit().id() === curr.data.displayUnit().id()) {
                amount = amount.div(conv.data.ratio()).round(minorUnit);
                return true;
            }
        });

        currency = curr.data.displayUnit().data.code();
    }

    return {
        amount: amount.toLocaleString(undefined, style),
        currency: currency,
        effective: (
            value.effective === null
            ? null
            : f.formats.dateTime.fromType(value.effective)
        ),
        baseAmount: (
            value.baseAmount === null
            ? null
            : f.types.number.fromType(value.baseAmount)
        )
    };
};

f.formats.money.toType = function (value) {
    value = value || f.money();
    let amount = f.types.number.toType(value.amount);
    let currency = f.formats.string.toType(value.currency);
    let curr = f.getCurrency(value.currency);

    if (curr.data.hasDisplayUnit() && currency !== curr.data.code()) {
        curr.data.conversions().some(function (conv) {
            if (conv.data.toUnit().id() === curr.data.displayUnit().id()) {
                amount = amount.times(
                    conv.data.ratio().round(curr.data.minorUnit())
                );
                return true;
            }
        });

        currency = curr.data.code();
    }

    return {
        amount: amount,
        currency: currency,
        effective: (
            value.effective === null
            ? null
            : f.formats.dateTime.toType(value.effective)
        ),
        baseAmount: (
            value.baseAmount === null
            ? null
            : f.types.number.toType(value.baseAmount)
        )
    };
};

function byEffective(a, b) {
    let aEffect = a.data.effective();
    let bEffect = b.data.effective();

    return (
        aEffect > bEffect
        ? -1
        : 1
    );
}

f.baseCurrency = function (effective) {
    effective = (
        effective
        ? new Date(effective)
        : new Date()
    );

    let current;
    let currs = catalog.store().data().currencies();
    let baseCurrs = catalog.store().data().baseCurrencies();

    baseCurrs.sort(byEffective);
    current = baseCurrs.find(function (item) {
        return new Date(item.data.effective.toJSON()) <= effective;
    });

    // If effective date older than earliest base currency, take oldest
    if (!current) {
        current = baseCurrs[0];
    }

    current = current.data.currency().data.code();

    return currs.find(function (currency) {
        return currency.data.code() === current;
    });
};

/**
  Return a money object.

  @param {Number} Amount.
  @param {String} Currency code.
  @param {Date} Effective date.
  @param {Number} Base amount.
  @return {Object}
*/
f.money = function (amount, currency, effective, baseAmount) {
    let ret = {
        amount: amount || 0,
        currency: currency || f.baseCurrency().data.code(),
        effective: effective || null,
        baseAmount: baseAmount || null
    };

    return ret;
};

/**
  Helper function for building input elements

  Use of this function requires that "Checkbox" has been pre-registered,
  (i.e. "required") in the application before it is called.

  @param {Object} Options object
  @param {Object} [options.model] Model
  @param {String} [options.key] Property key
  @param {Object} [options.viewModel] View Model
  @param {Array} [options.dataList] Array for input lists
*/
f.buildInputComponent = function (obj) {
    let rel;
    let w;
    let component;
    let key = obj.key;
    let isPath = key.indexOf(".") !== -1;
    let prop = f.resolveProperty(obj.model, key);
    let format = prop.format || prop.type;
    let opts = obj.options || {};
    let components = catalog.store().components();
    let id = opts.id || key;

    function buildSelector() {
        let vm = obj.viewModel;
        let selectComponents = vm.selectComponents();
        let value = (
            opts.value === ""
            ? undefined
            : opts.value
        );

        if (selectComponents[id]) {
            if (
                selectComponents[id].value === value &&
                selectComponents[id].disabled === opts.disabled
            ) {
                return selectComponents[id].content;
            }
        } else {
            selectComponents[id] = {};
        }

        selectComponents[id].value = value;
        selectComponents[id].disabled = opts.disabled;
        selectComponents[id].content = m("select", {
            id: id,
            onchange: opts.onchange,
            value: value,
            disabled: opts.disabled,
            class: opts.class
        }, obj.dataList.map(function (item) {
            return m("option", {
                value: item.value
            }, item.label);
        }));

        return selectComponents[id].content;
    }

    // Handle input types
    if (typeof prop.type === "string" || isPath) {
        opts.type = f.inputMap[format];

        if (isPath || prop.isReadOnly()) {
            opts.disabled = true;
        } else {
            opts.disabled = false;
        }

        if (isPath || prop.isRequired()) {
            opts.required = true;
        }

        if (prop.type === "boolean") {
            component = m(components.checkbox, {
                id: id,
                value: prop(),
                onclick: prop,
                required: opts.required,
                disabled: opts.disabled,
                style: opts.style
            });
        } else if (
            prop.type === "object" &&
            prop.format === "money"
        ) {
            component = m(components.moneyRelation, {
                parentViewModel: obj.viewModel,
                parentProperty: key,
                filter: obj.filter,
                isCell: opts.isCell,
                style: opts.style,
                onCreate: opts.oncreate,
                onRemove: opts.onremove,
                showCurrency: opts.showCurrency,
                disableCurrency: opts.disableCurrency,
                id: id,
                disabled: prop.isReadOnly()
            });
        } else {
            opts.id = id;
            opts.onchange = (e) => prop(e.target.value);
            opts.value = prop();

            if (opts.class) {
                opts.class = "fb-input " + opts.class;
            } else {
                opts.class = "fb-input";
            }

            // If options were passed in, used a select element
            if (obj.dataList) {
                component = buildSelector();

            // Otherwise standard input
            } else {
                opts.style = opts.style || {};

                if (prop.type === "number" || prop.type === "integer") {
                    if (prop.min !== undefined) {
                        opts.min = prop.min;
                    }
                    if (prop.max !== undefined) {
                        opts.max = prop.max;
                    }
                    opts.class += " fb-input-number";
                }

                if (prop.format === "textArea") {
                    opts.rows = opts.rows || 4;
                    component = m("textarea", opts);
                } else {
                    component = m("input", opts);
                }
            }
        }

        return component;
    }

    // Handle relations
    if (prop.isToOne()) {
        rel = prop.type.relation.toCamelCase();
        w = catalog.store().components()[rel + "Relation"];

        if (w) {
            return m(w, {
                parentViewModel: obj.viewModel,
                parentProperty: key,
                filter: obj.filter,
                isCell: opts.isCell,
                style: opts.style,
                onCreate: opts.oncreate,
                onRemove: opts.onremove,
                id: id,
                disabled: prop.isReadOnly
            });
        }
    }

    if (prop.isToMany()) {
        w = catalog.store().components().childTable;
        if (w) {
            return m(w, {
                parentViewModel: obj.viewModel,
                parentProperty: key
            });
        }
    }

    console.log("Widget for property '" + key + "' is unknown");
};

/*
  Returns the exact x, y coordinents of an HTML element.

  Thanks to:
  http://www.kirupa.com/html5/get_element_position_using_javascript.htm
*/
f.getElementPosition = function (element) {
    let xPosition = 0;
    let yPosition = 0;

    while (element) {
        xPosition += (
            element.offsetLeft -
            element.scrollLeft +
            element.clientLeft
        );
        yPosition += (
            element.offsetTop -
            element.scrollTop +
            element.clientTop
        );
        element = element.offsetParent;
    }

    return {
        x: xPosition,
        y: yPosition
    };
};

/** @private  Helper function to resolve property dot notation */
f.resolveAlias = function (feather, attr) {
    let prefix;
    let suffix;
    let ret;
    let overload = (
        feather.overloads
        ? feather.overloads[attr] || {}
        : {}
    );
    let idx = attr.indexOf(".");

    if (idx > -1) {
        prefix = attr.slice(0, idx);
        suffix = attr.slice(idx + 1, attr.length);
        feather = catalog.getFeather(
            feather.properties[prefix].type.relation
        );
        return f.resolveAlias(feather, suffix);
    }

    ret = overload.alias || feather.properties[attr].alias || attr;
    return ret.toName();
};

/** @private  Helper function to resolve property dot notation */
f.resolveProperty = function (model, property) {
    let prefix;
    let suffix;
    let idx = property.indexOf(".");

    if (!model) {
        return stream(null);
    }

    if (idx > -1) {
        prefix = property.slice(0, idx);
        suffix = property.slice(idx + 1, property.length);
        return f.resolveProperty(model.data[prefix](), suffix);
    }

    return model.data[property];
};

export {f};
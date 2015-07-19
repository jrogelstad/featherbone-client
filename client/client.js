/*global m, window */

//this application only has one component: todo
var todo = {};

//for simplicity, we use this component to namespace the model classes

//the Todo class has two properties
todo.Todo = function (data) {
  this.description = m.prop(data.description);
  this.done = m.prop(false);
};

//the TodoList class is a list of Todo's
todo.TodoList = Array;

//the view-model tracks a running list of todos,
//stores a description for new todos before they are created
//and takes care of the logic surrounding when adding is permitted
//and clearing the input after adding a todo to the list
todo.vm = (function () {
  var vm = {};
  vm.init = function () {
    //a running list of todos
    vm.list = new todo.TodoList();

    //a slot to store the name of a new todo before it is created
    vm.description = m.prop("");

    //adds a todo to the list, and clears the description field for
    //user convenience
    vm.add = function () {
      if (vm.description()) {
        vm.list.push(new todo.Todo({description: vm.description()}));
        vm.description("");
      }
    };
  };
  return vm;
}());

//the controller defines what part of the model is relevant for the current page
//in our case, there's only one view-model that handles everything
todo.controller = function () {
  todo.vm.init();
};

//here's the view
todo.view = function () {
  return m("html", [
    m("body", [
      m("input", {onchange: m.withAttr("value", todo.vm.description),
        value: todo.vm.description()}),
      m("button", {onclick: todo.vm.add}, "Add"),
      m("table", [
        todo.vm.list.map(function (task, index) {
          return m("tr", [
            m("td", [
              m("input[type=checkbox]", {onclick:
                m.withAttr("checked", task.done),
                checked: task.done()})
            ]),
            m("td", {style: {textDecoration:
              task.done() ? "line-through" : "none"}}, task.description()),
          ]);
        })
      ])
    ])
  ]);
};

//initialize the application
m.mount(document, {controller: todo.controller, view: todo.view});


var State = (typeof require === 'function' ? require('statechart') :
      window.statechart).State;

var f = {

  /**
    Return a unique identifier string.

    Moddified from https://github.com/google/closure-library
    @author arv@google.com (Erik Arvidsson)
    http://www.apache.org/licenses/LICENSE-2.0

    @return {String}
  */
  createId: function () {
    var x = 2147483648,
      dt = new Date(),
      result = Math.floor(Math.random() * x).toString(36) +
        Math.abs(Math.floor(Math.random() * x) ^ dt).toString(36);

    return result;
  },

  /*
    TODO: Make this real
  */
  getCurrentUser: function () {
    return "admin";
  },

  /**
    Return a date that is the current time.

    @return {Date}
  */
  now: function () {
    return new Date();
  },

  /**
    Creates a property getter setter function with a default value.
    Includes state...

    @param {Any} Initial value
    @return {Function}
  */
  prop: function (store) {
    var newValue, oldValue, p;

    p = function (value) {
      if (arguments.length) {
        newValue = value;
        oldValue = store;

        p.state.send("change");
        store = newValue;
        p.state.send("changed");

        newValue = undefined;
        oldValue = newValue;
      }

      return store;
    };

    /*
      Getter setter for the new value

    */
    p.newValue = function (value) {
      if (arguments.length) {
        newValue = value;
      }

      return newValue;
    };
    p.oldValue = function () {
      return oldValue;
    };
    p.state = State.define(function () {
      this.state("ready", function () {
        this.event("change", function () {
          this.goto("../changing");
        });
        this.event("silence", function () {
          this.goto("../silent");
        });
        this.event("disable", function () {
          this.goto("../disabled");
        });
      });
      this.state("changing", function () {
        this.event("changed", function () {
          this.goto("../ready");
        });
      });
      this.state("silent", function () {
        this.event("report", function () {
          this.goto("../ready");
        });
        this.event("disable", function () {
          this.goto("../disabled");
        });
      });
      this.state("disabled", function () {
        // Attempts to change from disabled mode revert back
        this.event("changed", function () {
          store = oldValue;
        });
        this.event("enable", function () {
          this.goto("../ready");
        });
      });
    });

    p.toJSON = function () {
      return store;
    };

    p.state.goto();

    return p;
  }
};

f.model = function (spec, my) {
  spec = spec || {};

  var  state, doDelete, doFetch, doInit, doPatch, doPost, doProperties,
    that = {data: {}, onChange: {}},
    d = that.data;

  // ..........................................................
  // PUBLIC
  //

  that.save = function () {
    state.send("save");
  };

  /*
    Send event to fetch data based on the current id from the server.
    Only executes in "/ready" state.
  */
  that.fetch = function () {
    state.send("fetch");
  };

  /*
    Send event to delete the current object from the server.
    Only executes in "/ready/clean" and "/ready/new" states.
  */
  that.delete = function () {
    state.send("delete");
  };

  /*
    Send an event to all properties.

    @param {String} event name.
    @returns receiver
  */
  that.sendToProperties = function (str) {
    var keys = Object.keys(d);

    keys.forEach(function (key) {
      d[key].state.send(str);
    });

    return this;
  };

  /*
    Set properties to the values of a passed object

    @param {Object} Data to set
    @param {Boolean} Silence change events
    @returns reciever
  */
  that.set = function (data, silent) {
    var keys;

    if (typeof data === "object") {
      keys = Object.keys(data);

      // Silence events if applicable
      if (silent) { that.sendToProperties("silence"); }

      // Loop through each attribute and assign
      keys.forEach(function (key) {
        if (typeof d[key] === "function") {
          d[key](data[key]);
        }
      });

      that.sendToProperties("report"); // History?
    }

    return this;
  };

  // ..........................................................
  // PRIVATE
  //

  doDelete = function () {
    that.state.goto("/busy/saving");
  };

  doFetch = function () {
    var result = m.prop({}),
      callback = function () {
        that.set(result(), true);
        state.send('fetched');
      },
      url = "http://localhost:10010/" +
        my.name.toSpinalCase() + "/" + that.data.id();

    state.goto("/busy");
    m.request({method: "GET", url: url})
      .then(result)
      .then(callback);
  };

  doInit = function () {
    var keys;

    // Forward shared secrets to new object
    if (typeof my === "object") {
      if (typeof my.data === "object") { that.data = my.data; }
      if (typeof my.onChange === "object") { that.onChange = my.onChange; }
    }

    d = that.data;

    // Create properties
    if (typeof my === "object" && typeof my.properties === "object") {
      doProperties(my.properties);
    }

    keys = Object.keys(that.data);

    // loop through properties and bind events
    keys.forEach(function (key) {
      var pState,
        fn = that.onChange[key];

      // Execute onChange function if applicable
      if (typeof fn === "function") {
        pState = d[key].state.substateMap.changing;
        pState.enter(fn.bind(d[key]));
      }

      // Bubble event up to model when property changes
      d[key].state.substateMap.changing.exit(function () {
        state.send("changed");
      });
    });
  };

  doPatch = function () {
    that.state.goto("/busy/saving");
  };

  doPost = function () {
    that.state.goto("/busy/saving");
  };

  doProperties = function (props) {
    var keys;

    keys = Object.keys(props);

    keys.forEach(function (key) {
      var fn, defaultValue,
        value = spec[key];

      // Handle default
      if (value === undefined && props[key].default) {
        defaultValue = props[key].default;

        // Handle default that is a function
        if (typeof defaultValue === "string" &&
            defaultValue.match(/\(\)$/)) {
          fn = f[defaultValue.replace(/\(\)$/, "")];
          value = fn();
        } else {
          value = defaultValue;
        }
      }

      d[key] = f.prop(value);
      d[key].description = props[key].description;
      d[key].type = props[key].type;
      d[key].default = fn || defaultValue;
    });
  };


  state = State.define(function () {
    this.state("ready", function () {
      this.state("new", function () {
        this.enter(doInit);
        this.event("fetch", doFetch);
        this.event("save", doPost);
        this.event("delete", function () { this.goto("/ready/deleted"); });
      });

      this.state("fetched", function () {
        this.state("clean", function () {
          this.event("changed", function () { this.goto("../dirty"); });
          this.event("delete", doDelete);
        });

        this.state("dirty", function () {
          this.event("save", doPatch);
        });

        this.event("fetch", doFetch);
      });
    });

    this.state("busy", function () {
      this.state("fetching");
      this.state("saving");

      this.event("fetched", function () { this.goto("/ready/fetched"); });
      this.event("deleted", function () { this.goto("/deleted"); });
      this.event("error", function () { this.goto("/error"); });
    });

    this.state("deleted", function () {
      // Prevent exiting from this state
      this.canExit = function () { return false; };
    });

    this.state("error", function () {
      // Prevent exiting from this state
      this.canExit = function () { return false; };
    });
  });

  // Expose specific state capabilities users can see and manipulate
  that.state = {
    send: function (str) {
      return state.send(str);
    },
    current: function () {
      return state.current();
    }
  };

  state.goto();

  return that;
};

f.contact = function (spec, my) {
  spec = spec || {};

  var that,
    shared = {name: "Contact", data: {}};

  // ..........................................................
  // PROPERTIES 
  //

  shared.properties = {
    id: {
      description: "Surrogate key",
      type: "string",
      default: "createId()"
    },
    created: {
      description: "Create time of the record",
      type: "dateTime",
      default: "now()"
    },
    createdBy: {
      description: "User who created the record",
      type: "string",
      default: "getCurrentUser()"
    },
    updated: {
      description: "Last time the record was updated",
      type: "dateTime",
      default: "now()"
    },
    updatedBy: {
      description: "User who created the record",
      type: "string",
      default: "getCurrentUser()"
    },
    isDeleted: {
      description: "Indicates the record is no longer active",
      type: "boolean"
    },
    objectType: {
      description: "Discriminates which inherited object type",
      type: "string"
    },
    owner: {
      description: "Owner of the document",
      type: "string",
      default: "getCurrentUser()"
    },
    notes: {
      description: "Notes",
      type: {
        relation: "DocumentNote",
        parentOf: "parent"
      }
    },
    etag: {
      description: "Optimistic locking key",
      type: "string",
      default: "createId()"
    },
    title: {
      description: "Honorific title",
      type: "string"
    },
    first: {
      description: "First name",
      type: "string"
    },
    last: {
      description: "Last name",
      type: "string"
    }
  };

  // ..........................................................
  // CHANGE EVENT HANDLERS
  //

  shared.onChange = {
    first: function () {
      console.log("First name changed from " +
        this.oldValue() + " to " + this.newValue() + "!");
    },
    last: function () {
      console.log("Last name changed from " +
        this.oldValue() + " to " + this.newValue() + "!");
    },
    id: function () {
      console.log("Id changed from " +
        this.oldValue() + " to " + this.newValue() + "!");
    }
  };

  // ..........................................................
  // LOCAL OVERLOADS
  //

  that = f.model(spec, shared);


  return that;
};

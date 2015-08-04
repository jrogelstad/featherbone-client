/**
    Featherbone is a JavaScript based persistence framework for building object
    relational database applications

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
/*global obj, featherbone, init, plv8, ERROR, featherbone */
var resp;

if (init || typeof featherbone === "undefined") {
  plv8.execute('SELECT init()');
  featherbone = require("postgres-datasource");
}

try {
  resp = featherbone.request(obj);
} catch (err) {
  if (typeof err === "object") {
    err.statusCode = err.statusCode || 500;
    resp = err;
  } else {
    resp = {message: err, statusCode: 500}
  }

  resp.isError = true;
}

return resp;

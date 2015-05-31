﻿/**
    Featherbone is a JavaScript based persistence framework for building object relational database applications
    
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

var user = plv8.execute("SELECT CURRENT_USER")[0].current_user;

plv8.execute('SELECT init()');

/* Create default global folder */
global = featherbone.request({
  name: "Folder",
  action: "GET",
  user: user,
  id: "global"
});

if (!Object.keys(global).length) {
  featherbone.request({
    name: "Folder",
    action: "POST",
    user: user,
    folder: false,
    data: {
      id: "global",
      name: "Global folder",
      description: "Root folder for all objects"
    }
  });
}

/* Create Everyone role */
role = featherbone.request({
  name: "Role",
  action: "GET",
  user: user,
  id: "everyone"
});

if (!Object.keys(role).length) {
  featherbone.request({
    name: "Role",
    action: "POST",
    user: user,
    folder: "global",
    data: {
      id: "everyone",
      name: "Everyone",
      description: "All users",
      members: [
        {member: user}
      ]
    }
  });

  /* Grant everyone access to global folder */
  req = {
    action: "POST",
    name: "saveAuthorization",
    user: user,
    data: {
      id: "global",
      role: "everyone",
      isMember: true,
      actions: {
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true
      }
    }
  };

  /* Access to folder contents */
  featherbone.request(req);

  /* Access to folder itself */
  delete req.data.isMember;
  featherbone.request(req);

  /* Grant everyone access to other objects */
  req.data.id = "role";
  featherbone.request(req);
  req.data.id = "folder";
  featherbone.request(req);
  req.data.id = "log"
  featherbone.request(req);
}

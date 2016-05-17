
function Firegig(path) {

        var self = this;
        self._error = null;
        self.db_data = {};
        self.actions = [];

        // Generate uniq reference ID for object
        //
        self.ref_id = self._getUniqRefId();

        var valid_data = self._validatePath(path);

        if (!(self._error)) {
            var collectionName = valid_data.collectionName,
                objectName = valid_data.objectName,
                mhost = valid_data.mhost;
        
            self.socket = new Primus(mhost);

            // Main entry: socket conenction established with server
            //
            self.socket.on('open', function() {
                // Subscribe to oobject from DB
                // /
                var data = {type: 'subscribe', ref_id: self.ref_id, channel: collectionName, variable: objectName};
                self.socket.write(data);

                //Get any data from Server
                //
                self.socket.on('data', function(obj) {
                    // Check error state in data from server
                    //
                    self._validateData(obj);

                    // Check error state in DB change
                    //
                    if (!('error' in self.db_data)) {

                        // If first time subscribe
                        //
                        if (('subscribe' in obj) && (obj.ref_id == self.ref_id)) {
                            for(var p in obj) {
                                if(p != 'subscribe' && p != 'ref_id') {
                                    self.db_data[p] = obj[p];
                                }
                            }
                            for(var i=0; i < self.actions.length; i++) {
                                switch(self.actions[i].act) {
                                    case 'upsert': 
                                        self.upsert(self.actions[i].field, self.actions[i].val);
                                        break;
                                    case 'del':
                                        self.del(self.actions[i].field);
                                        break;
                                }
                            }
                            self.actions = [];
                        } 
                        // If occured data change in DB
                        //
                        else if (obj.ref_id != self.ref_id && !('subscribe' in obj) && !('error' in obj)) {
                            var sub = self._getSubObject(self.db_data, obj.obj_name);
                            for(var p in obj) {
                                if(p != 'ref_id' && p != 'obj_name') {
                                    sub[p] = obj[p];
                                }
                            }
                            for(var p in sub) {
                                if(!(p in obj)) {
                                    delete sub[p];
                                }
                            }
                        }
                    }
                });

                self.socket.on('end', function() {
                    console.log('Socket connection closed');
                });

                self.socket.on('reconnect', function() {
                    console.log('Socket reconnect');
                });

                self.socket.on('reconnecting', function() {
                    console.log('Socket reconnecting');
                });            
            });
    }
}


// Interface
//
Firegig.prototype = {

        // Update or Insert new Field into object
        //
        upsert: function(field, value) {
                if('obj_name' in this.db_data) {
                    this.db_data[field] = value;
                    var obj = {type: 'upsert', data: {field: field, val: value, obj_name: this.db_data.obj_name}, ref_id: this.ref_id};
                    this.socket.write(obj);
                } else {
                    this.actions.push({act: 'upsert', field: field, val: value});
                }
            },

        // Delete object field
        //
        del: function (field) {
                if('obj_name' in this.db_data) {
                    delete this.db_data[field];
                    var obj = {type: 'del', data: {field: field, obj_name: this.db_data.obj_name}, ref_id: this.ref_id};
                    this.socket.write(obj);
                } else {
                    this.actions.push({act: 'del', field: field});
                }
             },

        // Private functions
        //
        _getSubObject: function (obj, path) {
                if (obj.obj_name == path) {
                    return obj;
                } else {
                    var arr = path.split('/'),
                        len = obj.obj_name.split('/').length,
                        car = obj;
                    for(var i=len; i<arr.length; i++) {
                        car = car[arr[i]];
                    }
                }
                return car;
            },

        _startsWith:  function (str, sub) {
                return str.substring(0, sub.length) == sub;
            },

        _validateData: function(data) {
            if ('_error' in data) {
                this.db_data._error = data._error;
            } else {
                if ('_error' in this.db_data) {
                    delete this.db_data._error;
                }
            }
        },

        _validatePath: function(path) {
            var return_value = {},
                parser = document.createElement('a');
            parser.href=path;

            var mhost = parser.host,
                arr = parser.pathname.split('/', 2),
                collectionName = arr[1],
                objectName = parser.pathname.split(collectionName, 2)[1];
            return_value.mhost = parser.protocol + '//' + mhost;
            if (collectionName != 'undefined' && collectionName) {
                return_value.collectionName = collectionName;
                if (objectName != 'undefined' && objectName) {
                    return_value.objectName = objectName;
                } else {
                    this._error = 'ERROR: main object is not valid in specified path';
                }
            } else {
                this._error = 'ERROR: chanel is not valid in specified path';
            }
            return return_value;
        },

        _getUniqRefId: function() {
            var time = new Date().getTime();
            return time.toString() + Math.floor((Math.random() * 10000) + 1).toString();
        }

};


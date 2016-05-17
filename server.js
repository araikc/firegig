
// libraries
var MongoClient = require('mongodb').MongoClient,
        configs     = require('./config.js'),
        Error       = require('./error.js'),
        db          = require('./db.js')();

var Primus = require('primus'),
    http = require('http'),
    server = http.createServer(),
    primus = new Primus(server, {transformer: 'sockjs'});

// Clients list class to broadcast messages if he listed to particular object
//
function Clients() {
    var self = this;
    self.clients = {};
}

Clients.prototype = {
    sendToAll: function(obj, message) {
        for(key in this.clients) {
            if(this.clients.hasOwnProperty(key) && obj.substring(0, this.clients[key].obj_name.length) == this.clients[key].obj_name) {
                this.clients[key].socket.write(message);
            }
        }
    },

    sendErrToAll: function (obj_name, message) {
        var sub_data = {};
        sub_data._error = message;
        this.sendToAll(obj_name, sub_data);
    },

    addClient: function(obj, socket) {
        this.clients[socket.id] = {socket: socket, obj_name: obj};
    },

    deleteClient: function(socket_id) {
        delete this.clients[socket_id];
    }
};

// Global object: clients list
//
var CLIENTS = new Clients();

// Main entry
//
primus.on('connection', function (socket) {
        socket.on('data', function(data) {
                var type = data.type;

                switch(type) {

                // SUBSCRIBE event from client
                //
                case 'subscribe':
                        var object_name= data.variable,
                            collection_name = data.channel;
                        db.then(
                        function(mongodb) {
                                var collection = mongodb.collection(data.channel),
                                    obj_name = collection_name + object_name,
                                    js_pure = Utils.js_db(obj_name),
                                    js_doc  = Utils.js_obj(obj_name);

                                CLIENTS.addClient(obj_name, socket);
                                collection.ensureIndex('obj_name', {unique: true}, function(err, data){});
                                var find_obj = {},
                                    criteria_obj = {};
                                criteria_obj.obj_name = js_doc;
                                if (js_pure) {
                                    find_obj[js_pure] = 1;
                                    criteria_obj[js_pure] = {$exists: true};
                                }
                                collection.findOne(criteria_obj, find_obj, function(err, db_data) {
                                    try {
                                        var sub_obj = Utils.getSubObject(db_data, js_pure);
                                        if(err || (js_pure && sub_obj == null)) throw new Error('Cant find [' + obj_name + '] object');

                                        // Found object in DB
                                        //
                                        if(db_data) {
                                                var sub_data = {};
                                                var db_obj = js_pure ? sub_obj : db_data;
                                                for(var p in db_obj) {
                                                        sub_data[p] = db_obj[p];
                                                }
                                                sub_data.ref_id = data.ref_id;
                                                sub_data.subscribe = 1;
                                                sub_data.obj_name = obj_name;
                                                CLIENTS.sendToAll(obj_name, sub_data);
                                        } 

                                        // Add New Object in DB
                                        //
                                        else if (Utils.is_new_root(object_name)) {
                                                collection.insert({obj_name: obj_name}, {w: 1}, function(err, docs) {
                                                        if(err && err.err.substring(0, 6) == 'E11000') { // trying to create same object simultaniusly
                                                                collection.findOne({obj_name: obj_name}, function(err, item) {
                                                                        var sub_data = {};
                                                                        for(var p in item) {
                                                                                sub_data[p] = item[p];
                                                                        }
                                                                        sub_data.ref_id = data.ref_id;
                                                                        sub_data.subscribe = 1;
                                                                        CLIENTS.sendToAll(obj_name, sub_data);
                                                                });
                                                        } else if (!(err)) {
                                                                var sub_data = {},
                                                                    doc = docs[0];
                                                                for(var p in doc) {
                                                                        sub_data[p] = doc[p];
                                                                }
                                                                sub_data.ref_id = data.ref_id;
                                                                sub_data.subscribe = 1;
                                                                CLIENTS.sendToAll(obj_name, sub_data);
                                                        } else if(err) {
                                                                CLIENTS.sendErrToAll(obj_name, 'ERROR: Unhandled error during insert into DB');
                                                        }
                                                });
                                        } else {
                                            // Wrong object name
                                            CLIENTS.sendErrToAll(obj_name, 'Object does not exist: [' + object_name + ']');
                                        }
                                    } catch (e) {
                                        if (e instanceof Error) {
                                            CLIENTS.sendErrToAll(obj_name, e.getMessage());
                                        } else {
                                            CLIENTS.sendErrToAll(obj_name, 'Unhandled exception in server');
                                        }
                                    }
                                });
                        }, function(e) {
                                CLIENTS.sendErrToAll(obj_name, 'Unable to connect to DB');
                        });
                break;

                // UPSERT event from client : add or update field in obj
                //
                case 'upsert':
                        db.then(function(mongodb) {
                                var collection_name = data.data.obj_name.split('/')[0],
                                    collection = mongodb.collection(collection_name),
                                    js_pure = Utils.js_db(data.data.obj_name),
                                    js_doc  = Utils.js_obj(data.data.obj_name),
                                    update = {};
                                var db_path = js_pure ? js_pure + '.' + data.data.field : data.data.field;
                                update[db_path] = data.data.val;
                                collection.findAndModify({obj_name: js_doc}, [['_id','asc']], {$set: update}, {'new': true}, function(err, doc) {
                                    var sub_obj = Utils.getSubObject(doc, js_pure);
                                    if (err || !(sub_obj)) {
                                        CLIENTS.sendErrToAll(data.data.obj_name, 'Unable to update in DB');
                                    } else {
                                        var sub_data = {};
                                        var db_obj = js_pure ? sub_obj: doc;

                                        for(var p in db_obj) {
                                            sub_data[p] = db_obj[p];
                                        }
                                        sub_data.ref_id = data.ref_id;
                                        sub_data.obj_name = data.data.obj_name;
                                        CLIENTS.sendToAll(data.data.obj_name, sub_data);
                                    }
                                });
                        }, function(e) {
                                CLIENTS.sendErrToAll(data.data.obj_name, 'Unable to connect to DB');
                        });
                break;

                // DELETE event from client : delete field from object
                //
                case 'del':
                        db.then(function(mongodb) {
                                var collection_name = data.data.obj_name.split('/')[0],
                                    collection = mongodb.collection(collection_name),
                                    js_pure = Utils.js_db(data.data.obj_name),
                                    js_doc  = Utils.js_obj(data.data.obj_name),
                                    update = {};
                                var db_path = js_pure ? js_pure + '.' + data.data.field: data.data.field;
                                update[db_path] = '';
                                collection.findAndModify({obj_name: js_doc}, [['_id','asc']], {$unset: update}, {'new': true}, function(err, doc) {
                                   var sub_obj = Utils.getSubObject(doc, js_pure);
                                    if (err || !(sub_obj)) {
                                        CLIENTS.sendErrToAll(data.data.obj_name, 'Unable to update in DB');
                                    } else {
                                        var sub_data = {};
                                        var db_obj = js_pure ? sub_obj : doc;

                                        for(var p in db_obj) {
                                                sub_data[p] = db_obj[p];
                                        }
                                        sub_data.ref_id = data.ref_id;
                                        sub_data.obj_name = data.data.obj_name;
                                        CLIENTS.sendToAll(data.data.obj_name, sub_data);
                                        }
                                });
                        }, function(e) {
                                CLIENTS.sendErrToAll(data.data.obj_name, 'Unable to connect to DB');
                        }); 
                break;
                default:
                        CLIENTS.sendErrToAll(data.data.obj_name, 'Wrong action');
                }
        });
    
        // CLOSE socket
        //
        socket.on('end', function() {
            CLIENTS.deleteClient(socket.id);
        });

});

////////////////////// UTILS //////////////////////////

Utils = {

    // Get DB path
    //
    js_db: function (path) {
        var arr = path.split('/');
        return arr.slice(2).join('.');
    },

    // Get Main object
    //
    js_obj: function (path) {
        var arr = path.split('/');
        return arr.slice(0, 2).join('/');
    },

    // Is new object creation request
    //
    is_new_root: function (path) {
        return path.split('/').length == 2;
    },

    // Get subobject reference by hierarchical path
    //
    getSubObject: function (obj, path) {
        if (!(obj)) return null;
        if (!(path)) return obj;
        var arr = path.split('.'),
            car = obj;
        for(var i=0; i<arr.length; i++) {
            if(arr[i] in car) {
                car = car[arr[i]];
            } else {
                return null;
            }
        }
        return car;
    }
}

/////////////////////////////////////////////////////////

server.listen(configs.GLOBAL.PORT);

function DBError(m, p){
	this.message = m;
	this.prev = p;
}

var mongodb     = require('mongodb');
var mongoClient = mongodb.MongoClient;
var Vow         = require('vow');
var configs     = require('./config.js');
var mongoURL    = configs.GLOBAL.DB_CONNECTION_STRING;

var DATABASE    = null;

module.exports = function(){
	var mongoPromise = Vow.defer(); 
	
	if(!(DATABASE)) {

		mongoClient.connect(mongoURL, function(err, database) {
				if(err) {
					DATABASE = null;
					var dbError = new DBError('Cant connect to MongoDB', err);
					mongoPromise.reject(dbError);
				}
				else{
					//WHEN CONNECTION WITH MONGO IS ESTEBLISHED SET DATABASE AS GLOBAL
					DATABASE = database;
					
					DATABASE.on('close', function(){
						DATABASE = null;
					});

					console.log('Connected to MongoDB');
					mongoPromise.resolve(DATABASE);	
				}
		});
	}
	else {
		mongoPromise.resolve(DATABASE);	
	}

	return mongoPromise.promise();
}
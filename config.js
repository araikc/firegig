

var HOST = process.argv[2] ? process.argv[2] : 'localhost';
var PORT = process.argv[3] ? process.argv[3] : 8001;
var DB   = process.argv[4] ? process.argv[4] : 'firegig_db';

var GLOBAL = { 
	HOST: HOST,
	PORT: PORT,
	DB: DB,
	DB_CONNECTION_STRING : 'mongodb://'+HOST+':27017/'+DB
};

exports.GLOBAL = GLOBAL;

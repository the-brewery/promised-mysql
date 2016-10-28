Promised MySQL
==============

Q promise wrapper for Node Mysql

Depends on node v6

Install
-------

`npm install --save mysql promised-mysql`

Basic usage
-----------

```javascript
//Connect to MySQL
//Because older version of mysql does not support multiple 'CURRENT_TIMESTAMP'
//and we use a created_at & updated_at, we need a separate trigger on those older mysql versions.
//The trigger is set when you have set the "timestamp_fallback" to true. Its disabled by default.
const config = {
	'host': 'localhost',
	'user': 'root',
	'password': '',
	'database': 'test',
	'debug': false,
	'timestamp_fallback': false
};
const db = (require('promised-mysql'))(config);

//Escape the variables before inserting into database
db.escape(value);

//Or with validation, last argument set to true, converts to json
db.validate_and_escape(value, _.isString, true);

//Do a query
db.query('show databases');

//Creates a table when it does not exists, alters it when there are new columns
//Adds a singulair prefix to every column name
//Adds created_at & updated_at columns
db.initialize_table(table_name, [
	{
		name: 'id',
		type: 'BIGINT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT'
	},
	{
		name: 'info',
		type: 'TEXT NOT NULL'
	}
]);

//EXAMPLE: An initialized table called 'test_products' with the above set parameters, id & info, will look like this:
+-------------------------+---------------------+------+-----+-------------------+-----------------------------+
| Field                   | Type                | Null | Key | Default           | Extra                       |
+-------------------------+---------------------+------+-----+-------------------+-----------------------------+
| test_product_id         | bigint(20) unsigned | NO   | PRI | NULL              | auto_increment              |
| test_product_info       | text                | NO   |     | NULL              |                             |
| test_product_created_at | timestamp           | NO   |     | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |
| test_product_updated_at | timestamp           | NO   |     | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |
+-------------------------+---------------------+------+-----+-------------------+-----------------------------+

//Inserts record and returns the record
db.insert_and_select(column_name, format(
    ' INSERT INTO `%s`' + 
    ' SET `temp_info` = "%s"',
    column_name,
    'test_info'
))

//Truncates all the tables in the database, specially handy for testing
db.truncate_all_tables()
```
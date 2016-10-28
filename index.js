'use strict';

const _ = require('lodash');
const format = require('util').format;
const mysql = require('mysql');
const q = require('q');

/**
 * Exposes the mysql functions and add some handy functions to it.
 */
class MySQL {

    /**
     * Saves the settings and creates a connection pool
     * @param  {array} settings - The Mysql connection settings
     * @return {void}
     */
    constructor(settings) {
        this.settings = settings;
        this.connection_pool = this.create_connection_pool();

        //Because older version of mysql does not support multiple 'CURRENT_TIMESTAMP'
        //and we use a created_at & updated_at, we need a separate trigger.
        //The trigger is set when adding the created_at & updated_at, and when initializing the table.
        q(settings)
        .then(set => {
            this.timestamp_fallback = set.timestamp_fallback ? true : false;
        });
    }

    /**
     * Uses the saved settings to create a new mysql connection pool
     * @return {empty promise}
     */
    create_connection_pool() {
        return q.all([this.settings])
        .spread(settings => mysql.createPool(_.merge({
            connectionLimit: 10,
            debug: false
        }, settings)));
    }

    /**
     * Uses the saved settings to create a new mysql connection
     * @return {empty promise}
     */
    create_single_connection(options) {
        return q.all([this.settings])
        .spread(settings => mysql.createConnection(_.merge({
            debug: false
        }, settings, options || {})));
    }

    /**
     * Checks if the table already exists
     * @param  {string} table_name - The name of the table
     * @return {promise} - true/false
     */
    table_exists(table_name) {
        return this.query(format(
            'SHOW TABLES LIKE "%s"', 
            table_name
        ))
        .then(result => {
            return !_.isEmpty(result);
        });
    }

    /**
     * Lists all the tables in the database
     * @return {promise} - array of table names
     */
    list_tables() {
        return this.query('SHOW TABLES')
        .then(result => {
            return result.map(item => {
                return _.values(item)[0];
            });
        });
    }

    /**
     * Lists all the columns in a given table
     * @param  {string} table_name - The name of the table
     * @return {promise} - array of column names
     */
    list_columns(table_name) {
        return this.query(format(
            'SHOW COLUMNS IN `%s`',
            table_name
        ))
        .then(result => {
            return result.map(item => {
                return item.Field;
            });
        });
    }

    create_update_timestamp_trigger(table_name) {
        return this.query(format(
            ' CREATE TRIGGER %s' +
            ' BEFORE INSERT ON %s' +
            ' FOR EACH ROW SET' +
            ' NEW.%s_created_at = NULL',
            table_name + '_trigger',
            table_name,
            this.make_singulair(table_name)
        ));
    }

    /**
     * Adds a created_at and updated_at column descriptions to the given object
     * @param {array} obj - The current column descriptions
     * @return {array} - The new column description array
     */
    add_created_updated_at_timestamp(obj) {
        return obj.concat([
            {
                name: 'created_at',
                type: this.timestamp_fallback ? 
                    'TIMESTAMP DEFAULT "0000-00-00 00:00:00"' :
                    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
            },
            {
                name: 'updated_at',
                type: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
            }
        ]);
    }

    /**
     * Adds prefixes to the name of every column
     * @param  {string} table_name - The name of the table
     * @param {array} obj - The current column descriptions
     * @return {array} - The new column description array
     */
    add_prefix_to_column_names(table_name, obj) {
        var tmp = _.map(obj, (item => {
            return _.merge({}, item, {name: format(
                '%s_%s', 
                this.make_singulair(table_name),
                item.name
            )});
        }));
        return tmp;
    }

    /**
     * If name ends with an S, remove it.
     * @param  {string} name - The name to make singulair
     * @return {string} the singulair name.
     */
    make_singulair(name) {
        return _.endsWith(name, 's') ? _.trimEnd(name, 's') : name;
    }

    /**
     * Escapes a value
     * @param  {string} value - The value to be escaped
     * @return {string} The escaped value
     */
    escape(value) {
        return this.connection_pool
        .invoke('escape', value);
    }

    /**
     * Escapes a value and validates it
     * @param  {string}  value - The value to be validated and escaped
     * @param  {function}  type_callback - The validation callback that should be tested against
     * @param  {Boolean} is_json - If its a json obj, parse it.
     * @return {escaped value} The escaped and validated value, throws an error of couldnt be validated
     */
    validate_and_escape(value, type_callback, is_json) {
        if(!type_callback(value))
            throw TypeError(value + ' is of an invalid type');

        return this.escape( is_json ? JSON.stringify(value) : value);
    }

    /**
     * Does a query to the database
     * @param  {string} query The ESCAPED query
     * @return {promise} The result of the query inside a promise
     */
    query(query) {
        return this.connection_pool
        .then(pool => q.ninvoke(pool, 'getConnection'))
        .then(connection => {
            return q.ninvoke(connection, 'query', query)
            .get(0)
            .then(results => {
                connection.release();
                return results;
            });
        });
    }

    /**
     * Initialize the table. 
     * If table doesnt exists, create it.
     * If table exists, alter it with the new columns.
     * @param  {string} table_name - The name of the table
     * @param  {obj} table_columns The table column descriptions
     * @return {promise} Result of the create/alter query
     */
    initialize_table(table_name, table_columns) {

        //Validate params
        if( !_.isString(table_name) || 
            !_.isArray(table_columns) || 
            table_columns.length == 0 ) {
            throw TypeError('While init table');
        }

        //Check if table already exists
        return this.table_exists(table_name)

        //List columns in table (if exists)
        .then(table_exists => {
            var existing_columns = undefined;
            if(table_exists) existing_columns = this.list_columns(table_name);
            return q.all([table_exists, existing_columns]);
        })

        //Remove existing columns from query and adds prefix to field
        .spread((table_exists, existing_columns) => {
            var columns = this.add_created_updated_at_timestamp(table_columns);
            columns = this.add_prefix_to_column_names(table_name, columns);

            if(!_.isUndefined(existing_columns)) {
                columns = _.filter(columns, item => {
                    return existing_columns.indexOf(item.name) == -1;
                });
            }

            return q.all([table_exists, columns]);
        })

        //Format query
        .spread((table_exists, columns) => {
            return q.all([
                table_exists,
                columns.map(item => {
                    if( !('name' in item) || !('type' in item)) {
                        throw TypeError('While init table');
                    }

                    return format('`%s` %s', item.name, item.type);
                }).join(',')
            ]);
        })

        //Do create/alter query
        .spread((table_exists, column_query) => {
            const q = table_exists ?
                format('ALTER TABLE `%s` ADD (%s)', table_name, column_query) :
                format('CREATE TABLE IF NOT EXISTS `%s` (%s)', table_name, column_query);

            if(_.isEmpty(column_query))
                return;

            return this.query(q)
            .then(result => {
                
                if(this.timestamp_fallback && result.warningCount === 0 && _.isEmpty(result.message)) {
                    return this.create_update_timestamp_trigger(table_name)
                    .thenResolve(result);
                } else {
                    return result;
                }

            });
        });
    }

    /**
     * Insert and select a record into the table
     * @param  {string} table_name - The name of the table
     * @param  {string} query - The ESCAPED query
     * @return {promise} the query result
     */
    insert_and_select(table_name, query) {
        return this.query(query)
        .then(result => {
            return this.query(format(
                'SELECT * FROM %s WHERE %s_id = %d',
                table_name,
                this.make_singulair(table_name),
                result.insertId
            ));
        })
        .get(0);
    }

    /**
     * Truncates all the tables in the database
     * @return {promise} empty
     */
    truncate_all_tables() {
        return q.all([
            this.create_single_connection({multipleStatements: true}),
            this.list_tables()
        ])
        .spread((connection, tables) => {
            return tables.reduce((prev, table) => prev.then(() => {
                return q.ninvoke(connection, 'query', (format(
                    'set foreign_key_checks = 0;' +
                    'truncate table `%s`;' +
                    'set foreign_key_checks = 1;',
                    table
                )));
            }), q())
            .then(() => connection.destroy());
        });
    }

}


/**
 * Creates a mysql object
 * @param  {array} settings The mysql connection settings
 * @return {obj} The mysql obj
 */
function setup(settings) {
    return new MySQL(settings);
}

module.exports = setup;
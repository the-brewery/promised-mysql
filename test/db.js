const q = require('q');
const format = require('util').format;
const expect = require('chai').expect;

const config = {
	'host': 'localhost',
	'user': 'root',
	'password': '',
	'database': 'test',
	'debug': false,
	'timestamp_fallback': false
};

const db = (require('../index'))(config);
const db2 = (require('../index'))(config);
const db3 = (require('../index'))(config);
const db4 = (require('../index'))(config);

describe('Database wrapper', () => {

	const table_name = 'test_products';
	const table_name_singular = 'test_product';
	const tables = [
		{
			name: 'id',
			type: 'BIGINT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT'
		},
		{
			name: 'info',
			type: 'TEXT NOT NULL'
		}
	];

	//Do not do anything before, otherwise this test case will not test proper

	it('shall initialize table with multiple connections at the same time', done => {
		return q.all([
			db.initialize_table(table_name, tables),
			db2.initialize_table(table_name, tables),
			db3.initialize_table(table_name, tables),
			db4.initialize_table(table_name, tables)
		])
		.then(() => {})
		.done(done);
	});

	it('truncate table', done => {
		db.truncate_all_tables()
		.then(() => {})
		.done(done);
	});

	it('shall insert and select record', done => {
		db.insert_and_select(table_name, format(
			' INSERT INTO `%s`' + 
			' SET `%s_info` = "%s"',
			table_name,
			table_name_singular,
			'INFOOOO'
		))
		.then(result => {
			expect(result.test_product_id).to.equal(1);
			expect(result.test_product_info).to.equal('INFOOOO');
			expect(result).to.have.property('test_product_created_at');
			expect(result).to.have.property('test_product_updated_at');
		})
		.done(done);
	});

	it('shall select everything from table', done => {
		db.query(format(
			'SELECT * FROM `%s`',
			table_name
		))
		.then(result => {
			expect(result.length).to.equal(1);
		})
		.done(done);
	});

});
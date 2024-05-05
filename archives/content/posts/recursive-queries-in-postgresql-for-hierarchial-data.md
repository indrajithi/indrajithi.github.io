---
title: "Recursive Queries in PostgreSQL for Hierarchical Data"
date: 2022-02-14T21:56:55+05:30
draft: false
---

![Recursive Tree](/images/recursion_tree.png)


- Recursive queries are typically used to deal with hierarchical or tree-structured data. 
- A common example is when you have a `manager > employee` relation in a table and you have to construct the organization tree under a manager or find all N level managers of an employee.
> Strictly speaking, this process is iteration not recursion, but `RECURSIVE` is the terminology chosen by the SQL standards committee.


## PostgreSQL CTE: Common Table Expression

From the [docs](https://www.postgresql.org/docs/10/queries-with.html):
> `WITH` provides a way to write auxiliary statements for use in a larger query. These statements, which are often referred to as Common Table Expressions or CTEs, can be thought of as defining temporary tables that exist just for one query.

> A common table expression is a temporary result set which you can reference within another SQL statement. 

> A useful property of `WITH` queries is that they are evaluated only once per execution of the parent query, even if they are referred to more than once by the parent query or sibling `WITH` queries. 

> Thus, expensive calculations that are needed in multiple places can be placed within a `WITH` query to avoid redundant work.

> Another possible application is to prevent unwanted multiple evaluations of functions with side-effects



**Syntax:**

```sql
  WITH cte_name (column_list) AS (
      CTE_query_definition 
  )
  statement;
```

**Example:**

```sql
WITH regional_sales AS (
        SELECT region, SUM(amount) AS total_sales
        FROM orders
        GROUP BY region
     ), top_regions AS (
        SELECT region
        FROM regional_sales
        WHERE total_sales > (SELECT SUM(total_sales)/10 FROM regional_sales)
     )
SELECT region,
       product,
       SUM(quantity) AS product_units,
       SUM(amount) AS product_sales
FROM orders
WHERE region IN (SELECT region FROM top_regions)
GROUP BY region, product;
```

_________


- The above query has two auxiliary statements named `regional_sales` and `top_regions`.
- The output of `regional_sales` is used in `top_regions` and the output of `top_region` is used in the primary `SELECT` query.
- We can write the above query without CTE, but it'd require us to write two levels of nested `sub-SELECTs`
- It is easier to follow this way and the auxiliary statements are executed only once although they are referenced multiple times.

## RECURSIVE WITH

- Using `RECURSIVE`, a `WITH` query can refer to its own outupt.

Lets took in to an example which counts from 1 to 20:

```sql
WITH RECURSIVE  cte
AS     (SELECT 1 AS n -- anchor member
        UNION
        SELECT n + 1 -- recursive member
        FROM   cte
        WHERE  n < 20 -- terminator
      )
SELECT n
FROM   cte;
```

```
 n
----
  1
  2
  3
  4
  5
  6
  7
  8
  9
 10
 11
 12
 13
 14
 15
 16
 17
 18
 19
 20
 ```
-----------------------
## Let's create some hierarchial data to play with
![tree](/images/org.jpg)

```sql
CREATE TABLE employees (
	id serial PRIMARY KEY,
	name VARCHAR NOT NULL,
	manager_id INT
);

INSERT INTO employees (id, name, manager_id) VALUES 
(1, 'Adam Smith', NULL),
(2, 'John Nash', 1),
(3, 'Mary Jones', 1),
(4, 'Peter Gregery', 2),
(5, 'Sam Joey', 3),
(6, 'Tim Lee', 4),
(7, 'Mohan Lal', 5),
(8, 'Will Smith', 6),
(10, 'Mohan Rathod', 8);
```

### Now lets find all the people working under `John Nash`.

```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id FROM employees
  WHERE id = 2
  UNION
  SELECT e.id, e.name, e.manager_id FROM employees as e
  JOIN tree t
  ON t.id = e.manager_id
  )
SELECT id, name, manager_id FROM tree;
```
```
SELECT id, name, manager_id from tree;
 id |     name      | manager_id
----+---------------+------------
  2 | John Nash     |          1
  4 | Peter Gregery |          2
  6 | Tim Lee       |          4
  8 | Will Smith    |          6
 10 | Mohan Rathod  |          8
 (5 rows)
 ```

- The first part of the query `Anchor Member` selects the Manager participant `John Nash` identified by `id = 2`
- Then we join that result with `employees` table on `t.id = e.manager_id` to find all the employees having `John Nash` as their manager
- This is repeated until all the results are returned

### How about all the N level managers of `Mohan Rathod`?

- We just need to reverse the condition on the `JOIN`

```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id FROM employees where id = 8
  UNION
  SELECT e.id, e.name, e.manager_id FROM employees as e
  JOIN tree t
  ON t.manager_id = e.id
  )
SELECT id, name, manager_id FROM tree;
```
```
 id |     name      | manager_id
----+---------------+------------
  8 | Will Smith    |          6
  6 | Tim Lee       |          4
  4 | Peter Gregery |          2
  2 | John Nash     |          1
  1 | Adam Smith    |
(5 rows)
```

### How to prevent infinite loop when are cycles in the data

The recursive query can run infinitely when there are cycles in the data.

> **Lets create an infinite loop**

In the above data if we update the manager_id with id. The manager for the employee will be that employee itself.

`UPDATE employees SET manager_id = 8 where id = 8;`

Now when we try to find all the people working under `employees.id = 8` it should run infinitely?

```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id FROM employees where id = 8
  UNION ALL
  SELECT e.id, e.name, e.manager_id FROM employees as e
  JOIN tree t
  ON t.id = e.manager_id
  )
SELECT id, name, manager_id FROM tree;
```
> A helpful trick for testing queries when you are not certain if they might loop is to place a `LIMIT` in the parent query like this `SELECT id, name, manager_id FROM tree limit 10;` **(Not recommended in Production)**

> Sometimes, using `UNION` instead of `UNION ALL` can remove the infinite loop by discarding rows that duplicate previous output rows. However, often a cycle does not involve output rows that are completely duplicate:

Take this for example:

```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id, 1 as depth FROM employees
         WHERE id = 2
  UNION
  SELECT e.id, e.name, e.manager_id, t.depth + 1
  FROM employees as e
  JOIN tree t
  ON t.id = e.manager_id
  )
  SELECT id, name, manager_id FROM tree;
```
```
SELECT id, name, manager_id, depth from tree;
 id |     name      | manager_id | depth
----+---------------+------------+-------
  2 | John Nash     |          1 |     1
  4 | Peter Gregery |          2 |     2
  6 | Tim Lee       |          4 |     3
(3 rows)
```

- When we run this query for `employees.id = 8` where there is a self referencing cycle, `UNION` will not solve our problem since each rows returned had distinct `depth` value

> You can try this (runs infinitely):

```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id, 1 as depth FROM employees
         WHERE id = 8
  UNION
  SELECT e.id, e.name, e.manager_id, t.depth + 1
  FROM employees as e
  JOIN tree t
  ON t.id = e.manager_id
  )
  SELECT id, name, manager_id FROM tree;
```

> To solve this type of problem, we can modify the query like this:

```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id, 1 as depth, ARRAY[id] as path,
         false as cycle FROM employees
  WHERE id = 8
  UNION
  SELECT e.id, e.name, e.manager_id, t.depth + 1,
         t.path || e.id, e.id = ANY(t.path)
  FROM employees as e
  JOIN tree t
  ON t.id = e.manager_id
  WHERE NOT t.cycle
  )
  SELECT id, name, manager_id, path, cycle FROM tree;
```
```
 id |     name     | manager_id |  path  | cycle
----+--------------+------------+--------+-------
  8 | Will Smith   |          8 | {8}    | f
 10 | Mohan Rathod |          8 | {8,10} | f
  8 | Will Smith   |          8 | {8,8}  | t
(3 rows)
```

> When there are multiple field to be checked to recognize a cycle, use an array of rows.


```sql
WITH RECURSIVE tree as (
  SELECT id, name, manager_id, 1 as depth, ARRAY[ROW(id, manager_id)] as path,
         false as cycle FROM employees
         WHERE id = 8
  UNION ALL
  SELECT e.id, e.name, e.manager_id, t.depth + 1,
         t.path || ROW(e.id, e.manager_id),
         ROW(e.id, e.manager_id) = ANY(t.path)
  FROM employees as e
  JOIN tree t
  ON t.id = e.manager_id
  WHERE NOT t.cycle
  )
  SELECT id, name, manager_id, path, cycle FROM tree;
```
```
 id |     name     | manager_id |        path        | cycle
----+--------------+------------+--------------------+-------
  8 | Will Smith   |          8 | {"(8,8)"}          | f
 10 | Mohan Rathod |          8 | {"(8,8)","(10,8)"} | f
  8 | Will Smith   |          8 | {"(8,8)","(8,8)"}  | t
(3 rows)
```

Reference:
1. https://www.postgresqltutorial.com/postgresql-recursive-query/
2. https://www.postgresql.org/docs/9.1/queries-with.html
3. https://hakibenita.com/be-careful-with-cte-in-postgre-sql

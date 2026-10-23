import {createHash} from 'node:crypto';
// Capture effective original object grants, including implicit PUBLIC execute
// on functions with a NULL ACL and explicit column grants. No row data/secrets.
export async function captureBrowserPermissions(database){
 const recipient="CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END";
 const recipientFilter="(a.grantee=0 OR r.rolname IN('anon','authenticated'))";
 const tableSql=`SELECT format('GRANT %s ON TABLE %I.%I TO %s%s;',a.privilege_type,n.nspname,c.relname,${recipient},CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) statement
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
 WHERE n.nspname IN('public','market','scraping') AND c.relkind IN('r','p','v','m') AND ${recipientFilter}`;
 const columnSql=`SELECT format('GRANT %s (%I) ON TABLE %I.%I TO %s%s;',a.privilege_type,col.attname,n.nspname,c.relname,${recipient},CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) statement
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute col ON col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped
 CROSS JOIN LATERAL aclexplode(col.attacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
 WHERE n.nspname IN('public','market','scraping') AND ${recipientFilter}`;
 const functionSql=`SELECT format('GRANT %s ON FUNCTION %I.%I(%s) TO %s%s;',a.privilege_type,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),${recipient},CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) statement
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee
 WHERE n.nspname IN('public','market','scraping') AND p.prokind<>'p' AND ${recipientFilter}`;
 const statements=[];
 for(const sql of [tableSql,columnSql,functionSql])statements.push(...(await database.query(sql)).rows.map(row=>row.statement));
 statements.sort();const sql=statements.join('\n')+'\n';
 return {statements:statements.length,sha256:createHash('sha256').update(sql).digest('hex'),sql};
}

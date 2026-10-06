import{DatabaseSync}from'node:sqlite';
import{readFileSync,readdirSync}from'node:fs';
export function localDatabase(path=':memory:'){
 const database=new DatabaseSync(path);
 database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort()){
  if(database.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
  database.exec(readFileSync('drizzle/'+name,'utf8'));database.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
 }
 return{
  database,
  prepare(sql){
   return{
    bind(...args){
     return{
      async first(){return database.prepare(sql).get(...args)||null;},
      async all(){return{results:database.prepare(sql).all(...args),success:true};},
      async run(){return{success:true,meta:database.prepare(sql).run(...args)};}
     };
    }
   };
  }
 };
}

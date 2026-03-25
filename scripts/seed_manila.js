require('dotenv').config({path:'.env.local'});
const{Pool}=require('pg');
const TOKEN=process.env.VITE_MAPILLARY_TOKEN||process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;
const dbUrl=(process.env.DATABASE_URL||'').replace(':5432/',':6543/');
const pool=new Pool({connectionString:dbUrl,ssl:{rejectUnauthorized:false},max:3});
const TILE=0.09,LIMIT=300,CONC=20;

// Seed only: Metro Manila + Luzon + Cebu + Davao priority areas
const PRIORITY=[
  {west:120.8,east:121.5,south:14.3,north:14.9},   // Metro Manila
  {west:120.5,east:122.0,south:13.5,north:16.5},   // Central Luzon
  {west:123.5,east:124.2,south:10.2,north:10.7},   // Metro Cebu
  {west:125.5,east:125.7,south:7.0,north:7.3},     // Davao City
  {west:122.5,east:124.5,south:9.5,north:12.5},    // Visayas
  {west:124.5,east:126.0,south:7.0,north:9.5},     // Mindanao north
];
const tiles=[];
for(const r of PRIORITY)
  for(let lng=r.west;lng<r.east;lng+=TILE)
    for(let lat=r.south;lat<r.north;lat+=TILE)
      tiles.push({w:+lng.toFixed(6),s:+lat.toFixed(6),e:+(lng+TILE).toFixed(6),n:+(lat+TILE).toFixed(6)});

async function run(){
  const fetched=await pool.query('SELECT tile_key FROM mapillary_fetched_tiles').then(r=>new Set(r.rows.map(x=>x.tile_key)));
  const pending=tiles.filter(t=>!fetched.has(`${t.w},${t.s},${t.e},${t.n}`));
  console.log(`Seeding ${pending.length} priority tiles`);
  let done=0,dots=0;
  for(let i=0;i<pending.length;i+=CONC){
    const batch=pending.slice(i,i+CONC);
    await Promise.all(batch.map(async t=>{
      const key=`${t.w},${t.s},${t.e},${t.n}`;
      try{
        const ctrl=new AbortController();
        const to=setTimeout(()=>ctrl.abort(),8000);
        const res=await fetch(`https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,geometry&bbox=${key}&limit=${LIMIT}`,{signal:ctrl.signal});
        clearTimeout(to);
        const d=await res.json();
        if(!d.error&&d.data?.length>0){
          const imgs=d.data.map(img=>({id:img.id,lat:img.geometry.coordinates[1],lng:img.geometry.coordinates[0]}));
          const vals=imgs.flatMap(i=>[i.id,i.lat,i.lng]);
          const ph=imgs.map((_,i)=>`($${i*3+1},$${i*3+2},$${i*3+3})`).join(',');
          await pool.query(`INSERT INTO mapillary_images(id,lat,lng)VALUES ${ph} ON CONFLICT(id) DO NOTHING`,vals);
          dots+=imgs.length;
          process.stdout.write(imgs.length>=LIMIT?'+':'.');
        }else{process.stdout.write('_');}
        await pool.query('INSERT INTO mapillary_fetched_tiles(tile_key)VALUES($1)ON CONFLICT DO NOTHING',[key]);
      }catch{process.stdout.write('x');try{await pool.query('INSERT INTO mapillary_fetched_tiles(tile_key)VALUES($1)ON CONFLICT DO NOTHING',[key]);}catch{}}
    }));
    done+=batch.length;
    if(done%200===0||i+CONC>=pending.length){
      const c=await pool.query('SELECT COUNT(*) FROM mapillary_images');
      process.stdout.write(`\n[${((done/pending.length)*100).toFixed(1)}%] ${done}/${pending.length} — ${c.rows[0].count} images\n`);
    }
  }
  console.log(`\nPriority seed done! ${dots} images added`);
  pool.end();
}
run().catch(e=>{console.error(e.message);pool.end()});

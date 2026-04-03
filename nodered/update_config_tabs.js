var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));

// Get both templates
var cfg = f.find(function(n) { return n.id === 'weg_d2_config_form'; });
var zones = f.find(function(n) { return n.id === 'weg_gauge_zones_ui'; });

// Extract the CONTENT of config (between password gate and </template>)
// and the CONTENT of zones
var cfgScript = cfg.format.substring(cfg.format.indexOf('<script>'));
var zonesFormat = zones.format;

// Remove the zones template node - we'll merge into config
f = f.filter(function(n) { return n.id !== 'weg_gauge_zones_ui'; });

// Build combined template with tabs
var T = [];
// Password gate
T.push('<template>');
T.push('<div v-if="!authed" style="width:100%;padding:60px 16px;text-align:center;font-family:Arial,sans-serif">');
T.push('  <div style="max-width:350px;margin:0 auto;background:white;border:1px solid #e0e0e0;border-radius:12px;padding:32px">');
T.push('    <div style="font-size:40px;margin-bottom:12px">&#128274;</div>');
T.push('    <h3 style="color:#1a4d8f;margin:0 0 8px">Acceso Restringido</h3>');
T.push('    <p style="color:#666;font-size:13px;margin:0 0 16px">Ingrese la contraseña para acceder</p>');
T.push('    <input type="password" v-model="pw" placeholder="Contraseña" @keyup.enter="checkPw" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:6px;font-size:16px;text-align:center;box-sizing:border-box;margin-bottom:12px" />');
T.push('    <div v-if="pwError" style="color:#c62828;font-size:13px;margin-bottom:12px">Contraseña incorrecta</div>');
T.push('    <button @click="checkPw" style="width:100%;background:#1a4d8f;color:white;border:none;padding:12px;border-radius:6px;font-size:16px;cursor:pointer;font-weight:bold">Ingresar</button>');
T.push('  </div>');
T.push('</div>');
// Main content with tabs
T.push('<div v-else style="width:100%;padding:16px;font-family:Arial,sans-serif">');
// Tab buttons
T.push('  <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid #e0e0e0">');
T.push('    <button @click="activeTab=\'devices\'" style="padding:12px 24px;border:none;cursor:pointer;font-size:15px;font-weight:bold;border-bottom:3px solid transparent;margin-bottom:-2px;transition:all 0.2s" :style="{color:activeTab===\'devices\'?\'#1a4d8f\':\'#999\',borderBottomColor:activeTab===\'devices\'?\'#1a4d8f\':\'transparent\',background:\'transparent\'}">Dispositivos</button>');
T.push('    <button @click="activeTab=\'zones\'" style="padding:12px 24px;border:none;cursor:pointer;font-size:15px;font-weight:bold;border-bottom:3px solid transparent;margin-bottom:-2px;transition:all 0.2s" :style="{color:activeTab===\'zones\'?\'#1a4d8f\':\'#999\',borderBottomColor:activeTab===\'zones\'?\'#1a4d8f\':\'transparent\',background:\'transparent\'}">Zonas de Gauges</button>');
T.push('  </div>');
T.push('  <div v-if="info" style="padding:10px;border-radius:6px;margin-bottom:12px;font-weight:bold" :style="{background:infoOk?\'#e8f5e9\':\'#fbe9e7\',color:infoOk?\'#2e7d32\':\'#c62828\'}">{{info}}</div>');

// ═══ TAB 1: DEVICES ═══
T.push('  <div v-show="activeTab===\'devices\'">');
T.push('    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">');
T.push('      <h2 style="color:#1a4d8f;margin:0">Dispositivos</h2>');
T.push('      <button @click="showAdd=true" style="background:#1a4d8f;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold">+ Agregar Drive</button>');
T.push('    </div>');
// Gateways
T.push('    <h3 style="color:#333;margin:0 0 8px">Gateways</h3>');
T.push('    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">');
T.push('      <tr style="background:#1a4d8f;color:white"><th style="padding:10px;text-align:left">Nombre</th><th style="padding:10px;text-align:left">IP</th><th style="padding:10px">Puerto</th><th style="padding:10px;text-align:left">Sitio</th></tr>');
T.push('      <tr v-for="g in gateways" :key="g.name" style="border-bottom:1px solid #e0e0e0"><td style="padding:10px;font-weight:bold">{{g.name}}</td><td style="padding:10px;font-family:monospace">{{g.ip}}</td><td style="padding:10px;text-align:center">{{g.port}}</td><td style="padding:10px">{{g.site}}</td></tr>');
T.push('    </table>');
// Devices table
T.push('    <h3 style="color:#333;margin:0 0 8px">Dispositivos ({{devices.length}})</h3>');
T.push('    <table style="width:100%;border-collapse:collapse">');
T.push('      <tr style="background:#1a4d8f;color:white"><th style="padding:8px;text-align:left">Nombre</th><th style="padding:8px">Tipo</th><th style="padding:8px;text-align:left">Sitio</th><th style="padding:8px;text-align:left">IP</th><th style="padding:8px">Puerto</th><th style="padding:8px">Unit ID</th><th style="padding:8px">Acciones</th></tr>');
T.push('      <tr v-for="(d,i) in devices" :key="d.name+i" style="border-bottom:1px solid #e0e0e0">');
T.push('        <template v-if="editIdx===i">');
T.push('          <td style="padding:6px"><input v-model="editDev.name" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px" /></td>');
T.push('          <td style="padding:6px"><select v-model="editDev.type" style="padding:6px;border:1px solid #ccc;border-radius:4px"><option>CFW900</option><option>SSW900</option></select></td>');
T.push('          <td style="padding:6px"><select v-model="editDev.site" style="padding:6px;border:1px solid #ccc;border-radius:4px"><option>Agriplus</option><option>Agrocaraya</option></select></td>');
T.push('          <td style="padding:6px"><input v-model="editDev.ip" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:monospace" /></td>');
T.push('          <td style="padding:6px"><input v-model.number="editDev.port" type="number" style="width:70px;padding:6px;border:1px solid #ccc;border-radius:4px;text-align:center" /></td>');
T.push('          <td style="padding:6px"><input v-model.number="editDev.unitId" type="number" style="width:50px;padding:6px;border:1px solid #ccc;border-radius:4px;text-align:center" /></td>');
T.push('          <td style="padding:6px;white-space:nowrap"><button @click="saveEdit(i)" style="background:#2e7d32;color:white;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;margin-right:4px">Guardar</button><button @click="editIdx=-1" style="background:#999;color:white;border:none;padding:5px 12px;border-radius:4px;cursor:pointer">Cancelar</button></td>');
T.push('        </template>');
T.push('        <template v-else>');
T.push('          <td style="padding:8px;font-weight:bold">{{d.name}}</td>');
T.push('          <td style="padding:8px;text-align:center"><span :style="{background:d.type===\'CFW900\'?\'#e3f2fd\':\'#f3e5f5\',color:d.type===\'CFW900\'?\'#1565c0\':\'#7b1fa2\',padding:\'2px 10px\',borderRadius:\'12px\',fontSize:\'12px\',fontWeight:\'bold\'}">{{d.type}}</span></td>');
T.push('          <td style="padding:8px">{{d.site}}</td>');
T.push('          <td style="padding:8px;font-family:monospace">{{d.ip}}</td>');
T.push('          <td style="padding:8px;text-align:center">{{d.port}}</td>');
T.push('          <td style="padding:8px;text-align:center">{{d.unitId}}</td>');
T.push('          <td style="padding:8px;white-space:nowrap"><button @click="startEdit(i)" style="background:#1a4d8f;color:white;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;margin-right:4px">Editar</button><button @click="delDevice(d.name)" style="background:#c62828;color:white;border:none;padding:5px 12px;border-radius:4px;cursor:pointer">Eliminar</button></td>');
T.push('        </template>');
T.push('      </tr>');
T.push('    </table>');
// Add modal
T.push('    <div v-if="showAdd" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999">');
T.push('      <div style="background:white;padding:24px;border-radius:12px;width:420px;max-width:90%">');
T.push('        <h3 style="color:#1a4d8f;margin:0 0 16px">Agregar Dispositivo</h3>');
T.push('        <div style="display:flex;flex-direction:column;gap:10px">');
T.push('          <div><label style="font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px">Nombre</label><input v-model="newDev.name" placeholder="SAER X" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box" /></div>');
T.push('          <div><label style="font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px">Tipo</label><select v-model="newDev.type" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px"><option>CFW900</option><option>SSW900</option></select></div>');
T.push('          <div><label style="font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px">Sitio</label><select v-model="newDev.site" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px"><option>Agriplus</option><option>Agrocaraya</option></select></div>');
T.push('          <div><label style="font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px">IP</label><input v-model="newDev.ip" placeholder="192.168.10.x" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-family:monospace;box-sizing:border-box" /></div>');
T.push('          <div style="display:flex;gap:10px"><div style="flex:1"><label style="font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px">Puerto</label><input v-model.number="newDev.port" type="number" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box" /></div><div style="flex:1"><label style="font-size:12px;color:#666;font-weight:bold;display:block;margin-bottom:2px">Unit ID</label><input v-model.number="newDev.unitId" type="number" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box" /></div></div>');
T.push('        </div>');
T.push('        <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end"><button @click="showAdd=false" style="background:#999;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer">Cancelar</button><button @click="addDevice" style="background:#1a4d8f;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold">Agregar</button></div>');
T.push('      </div>');
T.push('    </div>');
T.push('  </div>');

// ═══ TAB 2: ZONES ═══
T.push('  <div v-show="activeTab===\'zones\'">');
T.push('    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">');
T.push('      <h2 style="color:#1a4d8f;margin:0">Zonas de Gauges</h2>');
T.push('      <button @click="saveZones" :disabled="savingZ" style="background:#1a4d8f;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold">{{ savingZ ? "Guardando..." : "Guardar Cambios" }}</button>');
T.push('    </div>');
T.push('    <p style="color:#666;font-size:13px;margin:0 0 16px">Configure los rangos Verde/Amarillo/Rojo para cada gauge.</p>');
// Group by site
T.push('    <div v-for="site in zSites" :key="site" style="margin-bottom:16px">');
T.push('      <div @click="zSiteOpen[site]=!zSiteOpen[site]" style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:#1a4d8f;color:white;border-radius:8px;cursor:pointer;user-select:none" :style="{borderRadius:zSiteOpen[site]?\'8px 8px 0 0\':\'8px\'}">');
T.push('        <span style="font-size:12px;transition:transform 0.2s" :style="{transform:zSiteOpen[site]?\'rotate(90deg)\':\'rotate(0)\'}">&#9654;</span>');
T.push('        <strong>{{ site }}</strong>');
T.push('        <span style="opacity:0.7;font-size:12px">({{ zDrivesFor(site).length }} drives)</span>');
T.push('      </div>');
T.push('      <div v-show="zSiteOpen[site]" style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;padding:8px">');
// Drive collapsible
T.push('        <div v-for="(zd,zi) in zDrivesFor(site)" :key="zd.name" style="background:white;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px;overflow:hidden">');
T.push('          <div @click="zOpen[zd.name]=!zOpen[zd.name]" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none" :style="{background:zOpen[zd.name]?\'#f8f9fa\':\'white\'}">');
T.push('            <span style="font-size:12px;color:#999;transition:transform 0.2s" :style="{transform:zOpen[zd.name]?\'rotate(90deg)\':\'rotate(0)\'}">&#9654;</span>');
T.push('            <strong style="color:#1a4d8f">{{ zd.name }}</strong>');
T.push('            <span :style="{background:zd.type===\'CFW900\'?\'#e3f2fd\':\'#f3e5f5\',color:zd.type===\'CFW900\'?\'#1565c0\':\'#7b1fa2\',padding:\'2px 8px\',borderRadius:\'12px\',fontSize:\'11px\',fontWeight:\'bold\'}">{{ zd.type }}</span>');
T.push('          </div>');
T.push('          <div v-show="zOpen[zd.name]" style="padding:0 14px 12px">');
T.push('            <table style="width:100%;border-collapse:collapse">');
T.push('              <tr style="background:#f5f5f5"><th style="padding:6px;text-align:left;font-size:11px">Gauge</th><th style="padding:6px;text-align:center;font-size:11px">Min</th><th style="padding:6px;text-align:center;font-size:11px">Max</th><th style="padding:6px;text-align:center;font-size:11px;color:#22c55e">Verde hasta</th><th style="padding:6px;text-align:center;font-size:11px;color:#f59e0b">Amarillo hasta</th></tr>');
T.push('              <tr v-for="g in zGaugeList(zd)" :key="g.key" style="border-bottom:1px solid #eee">');
T.push('                <td style="padding:6px;font-weight:bold;font-size:13px">{{ g.label }} <span style="color:#999;font-size:10px">({{ g.unit }})</span></td>');
T.push('                <td style="padding:4px;text-align:center"><input type="number" v-model.number="zd.zones[g.key].min" style="width:60px;padding:5px;border:1px solid #ccc;border-radius:4px;text-align:center;font-size:13px" /></td>');
T.push('                <td style="padding:4px;text-align:center"><input type="number" v-model.number="zd.zones[g.key].max" style="width:60px;padding:5px;border:1px solid #ccc;border-radius:4px;text-align:center;font-size:13px" /></td>');
T.push('                <td style="padding:4px;text-align:center"><input type="number" v-model.number="zd.zones[g.key].green" style="width:60px;padding:5px;border:1px solid #22c55e;border-radius:4px;text-align:center;background:#f0fdf4;font-size:13px" /></td>');
T.push('                <td style="padding:4px;text-align:center"><input type="number" v-model.number="zd.zones[g.key].yellow" style="width:60px;padding:5px;border:1px solid #f59e0b;border-radius:4px;text-align:center;background:#fffbeb;font-size:13px" /></td>');
T.push('              </tr>');
T.push('            </table>');
T.push('            <button @click="zResetDrive(zd)" style="margin-top:6px;background:none;border:1px solid #999;color:#666;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer">Restaurar defaults</button>');
T.push('          </div>');
T.push('        </div>');
T.push('      </div>');
T.push('    </div>');
T.push('  </div>');

T.push('</div>');
T.push('</template>');

// ═══ SCRIPT ═══
T.push('<script>');
T.push('export default {');
T.push('  data: function() {');
T.push('    return {');
T.push('      authed:false, pw:"", pwError:false, activeTab:"devices",');
T.push('      info:"", infoOk:true,');
T.push('      // Devices tab');
T.push('      devices:[], gateways:[], loaded:false, showAdd:false, editIdx:-1,');
T.push('      newDev:{name:"",type:"CFW900",site:"Agriplus",ip:"",port:502,unitId:1}, editDev:{},');
T.push('      // Zones tab');
T.push('      zDrives:[], zSites:[], zSiteOpen:{}, zOpen:{}, savingZ:false,');
T.push('      zDefaults:{');
T.push('        CFW900:{velocidad:{min:0,max:1800,green:1200,yellow:1500},corriente:{min:0,max:150,green:80,yellow:120},tension:{min:0,max:500,green:380,yellow:480},frecuencia:{min:0,max:70,green:50,yellow:62}},');
T.push('        SSW900:{corriente:{min:0,max:800,green:500,yellow:700},tension:{min:0,max:500,green:380,yellow:480}}');
T.push('      }');
T.push('    }');
T.push('  },');
T.push('  mounted: function() { this.loadDevices(); this.loadZones(); },');
T.push('  methods: {');
T.push('    api: function(){return "http://"+window.location.hostname+":3200"},');
T.push('    checkPw: function(){if(this.pw==="Agriplus00.."){this.authed=true;this.pwError=false}else{this.pwError=true}},');
// Devices methods
T.push('    loadDevices: function(){var s=this;Promise.all([fetch(s.api()+"/api/config/devices").then(function(r){return r.json()}),fetch(s.api()+"/api/config/gateways").then(function(r){return r.json()})]).then(function(res){s.devices=res[0];s.gateways=res[1];s.loaded=true}).catch(function(e){s.info="Error: "+e.message;s.infoOk=false;s.loaded=true})},');
T.push('    addDevice: function(){var s=this;fetch(s.api()+"/api/config/devices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s.newDev)}).then(function(r){if(!r.ok)return r.json().then(function(e){throw new Error(e.error)});return r.json()}).then(function(){s.showAdd=false;s.newDev={name:"",type:"CFW900",site:"Agriplus",ip:"",port:502,unitId:1};s.info="Agregado";s.infoOk=true;s.loadDevices();s.loadZones();setTimeout(function(){s.info=""},3000)}).catch(function(e){s.info="Error: "+e.message;s.infoOk=false})},');
T.push('    startEdit: function(i){this.editIdx=i;this.editDev=JSON.parse(JSON.stringify(this.devices[i]))},');
T.push('    saveEdit: function(i){var s=this;s.devices[i]=JSON.parse(JSON.stringify(s.editDev));fetch(s.api()+"/api/config/devices",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(s.devices)}).then(function(r){return r.json()}).then(function(){s.editIdx=-1;s.info="Actualizado";s.infoOk=true;setTimeout(function(){s.info=""},3000)}).catch(function(e){s.info="Error: "+e.message;s.infoOk=false})},');
T.push('    delDevice: function(name){if(!confirm("Eliminar "+name+"?"))return;var s=this;fetch(s.api()+"/api/config/devices/"+encodeURIComponent(name),{method:"DELETE"}).then(function(r){return r.json()}).then(function(){s.info=name+" eliminado";s.infoOk=true;s.loadDevices();s.loadZones();setTimeout(function(){s.info=""},3000)}).catch(function(e){s.info="Error: "+e.message;s.infoOk=false})},');
// Zones methods
T.push('    zGetDef: function(type){var d=this.zDefaults[type]||this.zDefaults.CFW900;var c={};Object.keys(d).forEach(function(k){c[k]=JSON.parse(JSON.stringify(d[k]))});return c},');
T.push('    loadZones: function(){var s=this;fetch(s.api()+"/api/config").then(function(r){return r.json()}).then(function(cfg){var zones=cfg.gaugeZones||{};var siteSet={};s.zDrives=(cfg.devices||[]).map(function(dev){var dz=s.zGetDef(dev.type);var saved=zones[dev.name]||{};Object.keys(saved).forEach(function(k){if(dz[k])Object.assign(dz[k],saved[k])});siteSet[dev.site||"Sin Sitio"]=true;return{name:dev.name,type:dev.type,site:dev.site||"Sin Sitio",zones:dz}});s.zSites=Object.keys(siteSet);s.zSites.forEach(function(st){s.zSiteOpen[st]=true})}).catch(function(e){s.info="Error zones: "+e.message;s.infoOk=false})},');
T.push('    zDrivesFor: function(site){return this.zDrives.filter(function(d){return d.site===site})},');
T.push('    zGaugeList: function(d){var l=[];if(d.type==="CFW900")l.push({key:"velocidad",label:"Velocidad",unit:"RPM"});l.push({key:"corriente",label:"Corriente",unit:"A"});l.push({key:"tension",label:"Tension",unit:"V"});if(d.type==="CFW900")l.push({key:"frecuencia",label:"Frecuencia",unit:"Hz"});return l},');
T.push('    zResetDrive: function(d){d.zones=this.zGetDef(d.type)},');
T.push('    saveZones: function(){this.savingZ=true;var s=this;var zones={};s.zDrives.forEach(function(d){zones[d.name]=d.zones});fetch(s.api()+"/api/config").then(function(r){return r.json()}).then(function(cfg){cfg.gaugeZones=zones;return fetch(s.api()+"/api/config",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(cfg)})}).then(function(){s.savingZ=false;s.info="Zonas guardadas";s.infoOk=true;setTimeout(function(){s.info=""},3000)}).catch(function(e){s.savingZ=false;s.info="Error: "+e.message;s.infoOk=false})}');
T.push('  }');
T.push('}');
T.push('<' + '/script>');

cfg.format = T.join('\n');
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Config page merged with tabs: ' + cfg.format.length + ' chars');

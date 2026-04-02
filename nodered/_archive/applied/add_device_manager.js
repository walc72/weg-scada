var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var form = f.find(function(n) { return n.id === 'weg_d2_config_form'; });
if (!form) { console.log('Form not found'); process.exit(1); }

var newDefaults = '{velocidad:{min:0,max:1800,green:1200,yellow:1500,label:"Velocidad",unit:"RPM",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},corriente:{min:0,max:150,green:80,yellow:120,label:"Corriente",unit:"A",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},tension:{min:0,max:500,green:380,yellow:480,label:"Tensión",unit:"V",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},frecuencia:{min:0,max:70,green:50,yellow:62,label:"Frecuencia",unit:"Hz",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},potencia:{min:0,max:100,green:60,yellow:85,label:"Potencia",unit:"kW",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},temperatura:{min:-10,max:150,green:80,yellow:120,label:"Temp. Motor",unit:"°C",c1:"#3b82f6",c2:"#f59e0b",c3:"#ef4444"}}';

form.format = `<template>
<div>
  <v-dialog v-model="showLogin" persistent max-width="400">
    <v-card>
      <v-card-title style="font-weight:700">🔒 Acceso Restringido</v-card-title>
      <v-card-text>
        <p style="color:#666">Ingrese la contraseña para acceder.</p>
        <v-text-field v-model="password" label="Contraseña" type="password" variant="outlined" @keyup.enter="checkPassword" :error-messages="loginError"></v-text-field>
      </v-card-text>
      <v-card-actions><v-spacer></v-spacer><v-btn color="primary" @click="checkPassword">Ingresar</v-btn></v-card-actions>
    </v-card>
  </v-dialog>

  <div v-if="authenticated">

    <!-- ADD DEVICE SECTION -->
    <v-card variant="outlined" rounded="lg" class="mb-4">
      <v-card-title style="font-size:0.95em;font-weight:700;padding:10px 16px;background:#f0fdf4;border-bottom:1px solid #e5e7eb">
        <v-icon start color="green">mdi-plus-circle</v-icon> Agregar Nuevo Dispositivo
      </v-card-title>
      <v-card-text style="padding:12px 16px">
        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
          <v-text-field v-model="newDevice.name" label="Nombre" variant="outlined" density="compact" hide-details style="min-width:150px;flex:1" placeholder="Ej: CFW900 #5"></v-text-field>
          <v-select v-model="newDevice.type" :items="['CFW900','SSW900']" label="Tipo" variant="outlined" density="compact" hide-details style="min-width:120px;flex:0.5"></v-select>
          <v-text-field v-model="newDevice.ip" label="IP / Dirección" variant="outlined" density="compact" hide-details style="min-width:180px;flex:1" placeholder="Ej: 192.168.10.104 o RTU Addr 8"></v-text-field>
          <v-select v-model="newDevice.site" :items="['Agriplus','Agrocaraya']" label="Sitio" variant="outlined" density="compact" hide-details style="min-width:130px;flex:0.5"></v-select>
          <v-btn color="green" @click="addDevice" prepend-icon="mdi-plus" :disabled="!newDevice.name||!newDevice.ip">Agregar</v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- DEVICE TABS -->
    <v-tabs v-model="tab" color="primary" class="mb-4" show-arrows>
      <v-tab v-for="(dr, i) in drives" :key="i" :value="i">
        <v-icon start>{{dr.type==='SSW900'?'mdi-rotate-right':'mdi-lightning-bolt'}}</v-icon>{{ dr.name }}
      </v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item v-for="(dr, di) in drives" :key="di" :value="di">
        <v-alert type="info" variant="tonal" density="compact" class="mb-3" style="font-family:monospace;font-size:0.85em">
          {{ dr.name }} — {{ dr.ip }} — {{ dr.site }}
          <template v-slot:append>
            <v-btn icon="mdi-delete" variant="text" color="red" size="small" @click="removeDevice(di)" title="Eliminar dispositivo"></v-btn>
          </template>
        </v-alert>

        <div v-for="(cfg, key) in dr.config" :key="key" style="margin-bottom:10px">
          <v-card variant="outlined" rounded="lg">
            <v-card-title style="font-size:0.9em;font-weight:700;padding:8px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb">{{ cfg.label }} ({{ cfg.unit }})</v-card-title>
            <v-card-text style="padding:8px 14px">
              <div style="display:grid;grid-template-columns:1fr 40px 1fr 1fr 40px 1fr 40px 1fr;gap:6px;align-items:end">
                <v-text-field v-model.number="cfg.min" label="Min" type="number" variant="outlined" density="compact" hide-details></v-text-field>
                <input type="color" v-model="cfg.c1" style="width:36px;height:36px;border:1px solid #ddd;cursor:pointer;border-radius:6px;padding:2px"/>
                <v-text-field v-model.number="cfg.green" label="Umbral 1" type="number" variant="outlined" density="compact" hide-details></v-text-field>
                <div></div>
                <input type="color" v-model="cfg.c2" style="width:36px;height:36px;border:1px solid #ddd;cursor:pointer;border-radius:6px;padding:2px"/>
                <v-text-field v-model.number="cfg.yellow" label="Umbral 2" type="number" variant="outlined" density="compact" hide-details></v-text-field>
                <input type="color" v-model="cfg.c3" style="width:36px;height:36px;border:1px solid #ddd;cursor:pointer;border-radius:6px;padding:2px"/>
                <v-text-field v-model.number="cfg.max" label="Max" type="number" variant="outlined" density="compact" hide-details></v-text-field>
              </div>
              <div style="display:flex;gap:2px;margin-top:6px;height:8px;border-radius:4px;overflow:hidden">
                <div :style="{flex:Math.max(cfg.green-cfg.min,1),background:cfg.c1}"></div>
                <div :style="{flex:Math.max(cfg.yellow-cfg.green,1),background:cfg.c2}"></div>
                <div :style="{flex:Math.max(cfg.max-cfg.yellow,1),background:cfg.c3}"></div>
              </div>
            </v-card-text>
          </v-card>
        </div>

        <div style="display:flex;gap:8px;margin-top:4px">
          <v-btn color="primary" size="small" @click="saveAll" prepend-icon="mdi-content-save">Guardar</v-btn>
          <v-btn variant="outlined" size="small" @click="resetDrive(di)" prepend-icon="mdi-restore">Defaults</v-btn>
          <v-btn variant="text" size="small" @click="copyToAll(di)" prepend-icon="mdi-content-copy">Copiar a todos</v-btn>
        </div>
      </v-window-item>
    </v-window>

    <v-snackbar v-model="saved" color="success" timeout="2000">Guardado</v-snackbar>

    <v-divider class="my-4"></v-divider>
    <div style="display:flex;gap:12px;align-items:center;width:100%">
      <v-icon color="warning">mdi-key</v-icon>
      <v-text-field v-model="newPw" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="flex:1"></v-text-field>
      <v-btn color="warning" @click="changePw" prepend-icon="mdi-key">Cambiar Contraseña</v-btn>
    </div>
    <v-snackbar v-model="pwOk" color="warning" timeout="2000">Contraseña cambiada</v-snackbar>
  </div>
</div>
</template>

<script>
export default {
  data() {
    var def = ${newDefaults};
    function cp(o){return JSON.parse(JSON.stringify(o))}
    return {
      showLogin:true, authenticated:false, password:'', loginError:'',
      saved:false, pwOk:false, newPw:'', tab:0,
      defaults: def,
      newDevice: {name:'',type:'CFW900',ip:'',site:'Agriplus'},
      drives:[
        {name:'CFW900 #1',type:'CFW900',ip:'192.168.10.100',site:'Agriplus',config:cp(def)},
        {name:'CFW900 #2',type:'CFW900',ip:'192.168.10.101',site:'Agriplus',config:cp(def)},
        {name:'CFW900 #3',type:'CFW900',ip:'192.168.10.102',site:'Agriplus',config:cp(def)},
        {name:'CFW900 #4',type:'CFW900',ip:'192.168.10.103',site:'Agriplus',config:cp(def)},
        {name:'SSW900 #1',type:'SSW900',ip:'RTU Addr 5',site:'Agriplus',config:cp(def)},
        {name:'SSW900 #2',type:'SSW900',ip:'RTU Addr 6',site:'Agriplus',config:cp(def)},
        {name:'SSW900 #3',type:'SSW900',ip:'RTU Addr 7',site:'Agrocaraya',config:cp(def)}
      ]
    }
  },
  mounted(){this.send({topic:'load'})},
  watch:{
    msg(v){
      if(v&&v.topic==='configFull'&&v.payload){
        this.drives=v.payload;
      }
      if(v&&v.topic==='auth'){
        if(v.payload===true){this.authenticated=true;this.showLogin=false;this.loginError='';}
        else this.loginError='Incorrecta';
      }
    }
  },
  methods:{
    checkPassword(){this.send({topic:'auth',payload:this.password})},
    saveAll(){
      this.send({topic:'saveFull',payload:JSON.parse(JSON.stringify(this.drives))});
      this.saved=true;
    },
    addDevice(){
      var d=this.newDevice;
      if(!d.name||!d.ip)return;
      this.drives.push({
        name:d.name, type:d.type, ip:d.ip, site:d.site,
        config:JSON.parse(JSON.stringify(this.defaults))
      });
      this.newDevice={name:'',type:'CFW900',ip:'',site:'Agriplus'};
      this.saveAll();
      this.tab=this.drives.length-1;
    },
    removeDevice(idx){
      if(confirm('¿Eliminar '+this.drives[idx].name+'?')){
        this.drives.splice(idx,1);
        this.tab=0;
        this.saveAll();
      }
    },
    resetDrive(i){
      this.drives[i].config=JSON.parse(JSON.stringify(this.defaults));
      this.saveAll();
    },
    copyToAll(src){
      var s=JSON.stringify(this.drives[src].config);
      for(var i=0;i<this.drives.length;i++)this.drives[i].config=JSON.parse(s);
      this.saveAll();
    },
    changePw(){
      if(this.newPw.length>=4){this.send({topic:'changePassword',payload:this.newPw});this.newPw='';this.pwOk=true;}
    }
  }
}
</script>`;

console.log('Updated form with device manager + SSW#3 Agrocaraya');

// Update handler for full device list save/load
var handler = f.find(function(n) { return n.id === 'weg_d2_config_handler'; });
if (handler) {
    handler.func = [
        'var topic = msg.topic;',
        'if (topic === "load") {',
        '    var devices = global.get("deviceList");',
        '    if (devices) return {topic: "configFull", payload: devices};',
        '    return null;',
        '}',
        'if (topic === "auth") {',
        '    var storedPw = global.get("adminPassword") || "admin123";',
        '    return {topic: "auth", payload: msg.payload === storedPw};',
        '}',
        'if (topic === "saveFull") {',
        '    global.set("deviceList", msg.payload);',
        '    // Also update gaugeConfigPerDrive for backward compat',
        '    var configs = msg.payload.map(function(d) { return d.config; });',
        '    global.set("gaugeConfigPerDrive", configs);',
        '    node.status({fill:"green",shape:"dot",text: msg.payload.length + " devices saved"});',
        '    return null;',
        '}',
        'if (topic === "changePassword") {',
        '    global.set("adminPassword", msg.payload);',
        '    return null;',
        '}',
        'return null;'
    ].join('\n');
    console.log('Updated handler for full device list');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done');

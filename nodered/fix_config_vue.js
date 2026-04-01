var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

var form = f.find(function(n){return n.id==='weg_d2_config_form'});
if (!form) { console.log('Form not found!'); process.exit(1); }

// Rewrite with defaults inside data() — no external var
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
    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab v-for="(dr, i) in drives" :key="i" :value="i"><v-icon start>mdi-engine</v-icon>{{ dr.name }}</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item v-for="(dr, di) in drives" :key="di" :value="di">
        <v-alert type="info" variant="tonal" density="compact" class="mb-3" style="font-family:monospace;font-size:0.85em">{{ dr.name }} — {{ dr.ip }}</v-alert>
        <div v-for="(cfg, key) in dr.config" :key="key" style="margin-bottom:10px">
          <v-card variant="outlined" rounded="lg">
            <v-card-title style="font-size:0.9em;font-weight:700;padding:8px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb">{{ cfg.label }} ({{ cfg.unit }})</v-card-title>
            <v-card-text style="padding:8px 14px">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
                <v-text-field v-model.number="cfg.min" label="Min" type="number" variant="outlined" density="compact" hide-details></v-text-field>
                <v-text-field v-model.number="cfg.green" type="number" variant="outlined" density="compact" hide-details><template v-slot:label><span style="color:#22c55e;font-weight:600">🟢→🟡</span></template></v-text-field>
                <v-text-field v-model.number="cfg.yellow" type="number" variant="outlined" density="compact" hide-details><template v-slot:label><span style="color:#f59e0b;font-weight:600">🟡→🔴</span></template></v-text-field>
                <v-text-field v-model.number="cfg.max" label="Max" type="number" variant="outlined" density="compact" hide-details></v-text-field>
              </div>
              <div style="display:flex;gap:2px;margin-top:4px;height:5px;border-radius:3px;overflow:hidden">
                <div :style="{flex:Math.max(cfg.green-cfg.min,1),background:'#22c55e'}"></div>
                <div :style="{flex:Math.max(cfg.yellow-cfg.green,1),background:'#f59e0b'}"></div>
                <div :style="{flex:Math.max(cfg.max-cfg.yellow,1),background:'#ef4444'}"></div>
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
    <div style="display:flex;gap:8px;align-items:end">
      <v-text-field v-model="newPw" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="max-width:250px"></v-text-field>
      <v-btn color="warning" size="small" @click="changePw" prepend-icon="mdi-key">Cambiar</v-btn>
    </div>
    <v-snackbar v-model="pwOk" color="warning" timeout="2000">Contraseña cambiada</v-snackbar>
  </div>
</div>
</template>

<script>
export default {
  data() {
    var def = {velocidad:{min:0,max:1800,green:1200,yellow:1500,label:'Velocidad',unit:'RPM'},corriente:{min:0,max:150,green:80,yellow:120,label:'Corriente',unit:'A'},tension:{min:0,max:500,green:380,yellow:480,label:'Tensión',unit:'V'},frecuencia:{min:0,max:70,green:50,yellow:62,label:'Frecuencia',unit:'Hz'},potencia:{min:0,max:100,green:60,yellow:85,label:'Potencia',unit:'kW'},temperatura:{min:-10,max:150,green:80,yellow:120,label:'Temp. Motor',unit:'°C'}};
    function cp(o){return JSON.parse(JSON.stringify(o))}
    return {
      showLogin:true, authenticated:false, password:'', loginError:'',
      saved:false, pwOk:false, newPw:'', tab:0,
      defaults: def,
      drives:[
        {name:'CFW900 #1',ip:'192.168.10.100',config:cp(def)},
        {name:'CFW900 #2',ip:'192.168.10.101',config:cp(def)},
        {name:'CFW900 #3',ip:'192.168.10.102',config:cp(def)},
        {name:'CFW900 #4',ip:'192.168.10.103',config:cp(def)},
        {name:'SSW900 #1',ip:'RTU Addr 5',config:cp(def)},
        {name:'SSW900 #2',ip:'RTU Addr 6',config:cp(def)}
      ]
    }
  },
  mounted(){this.send({topic:'load'})},
  watch:{
    msg(v){
      if(v&&v.topic==='config'&&v.payload){
        for(var i=0;i<this.drives.length;i++){
          if(v.payload[i])this.drives[i].config=v.payload[i];
        }
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
      this.send({topic:'save',payload:this.drives.map(function(d){return JSON.parse(JSON.stringify(d.config))})});
      this.saved=true;
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

console.log('Rewrote config form with inline defaults');
fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));

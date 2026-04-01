var fs = require('fs');
var f = JSON.parse(fs.readFileSync('/data/flows.json'));

// Update config form to add Gateway RTU→TCP section
var cfgForm = f.find(function(n){ return n.id === 'weg_d2_config_form'; });
if (!cfgForm) { console.log('Config form not found!'); process.exit(1); }

cfgForm.format = '<template>\n' +
'<div>\n' +
'  <v-dialog v-model="showLogin" persistent max-width="400">\n' +
'    <v-card>\n' +
'      <v-card-title style="font-weight:700">🔒 Acceso Restringido</v-card-title>\n' +
'      <v-card-text>\n' +
'        <p style="color:#666">Ingrese la contraseña para acceder.</p>\n' +
'        <v-text-field v-model="password" label="Contraseña" type="password" variant="outlined" @keyup.enter="checkPassword" :error-messages="loginError"></v-text-field>\n' +
'      </v-card-text>\n' +
'      <v-card-actions><v-spacer></v-spacer><v-btn color="primary" @click="checkPassword">Ingresar</v-btn></v-card-actions>\n' +
'    </v-card>\n' +
'  </v-dialog>\n' +
'\n' +
'  <div v-if="authenticated">\n' +
'\n' +
'    <!-- MAIN TABS: Dispositivos / Gateways -->\n' +
'    <v-tabs v-model="mainTab" color="primary" class="mb-4">\n' +
'      <v-tab value="devices"><v-icon start>mdi-lightning-bolt</v-icon>Dispositivos</v-tab>\n' +
'      <v-tab value="gateways"><v-icon start>mdi-swap-horizontal</v-icon>Gateways RTU→TCP</v-tab>\n' +
'    </v-tabs>\n' +
'\n' +
'    <v-window v-model="mainTab">\n' +
'\n' +
'      <!-- ==================== DISPOSITIVOS TAB ==================== -->\n' +
'      <v-window-item value="devices">\n' +
'\n' +
'        <!-- ADD DEVICE SECTION -->\n' +
'        <v-card variant="outlined" rounded="lg" class="mb-4">\n' +
'          <v-card-title style="font-size:0.95em;font-weight:700;padding:10px 16px;background:#f0fdf4;border-bottom:1px solid #e5e7eb">\n' +
'            <v-icon start color="green">mdi-plus-circle</v-icon> Agregar Nuevo Dispositivo\n' +
'          </v-card-title>\n' +
'          <v-card-text style="padding:12px 16px">\n' +
'            <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">\n' +
'              <v-text-field v-model="newDevice.name" label="Nombre" variant="outlined" density="compact" hide-details style="min-width:140px;flex:1" placeholder="Ej: CFW900 #5"></v-text-field>\n' +
'              <v-select v-model="newDevice.type" :items="[\'CFW900\',\'SSW900\']" label="Tipo" variant="outlined" density="compact" hide-details style="min-width:120px;flex:0.5"></v-select>\n' +
'              <v-select v-model="newDevice.connType" :items="[\'TCP Directo\',\'RTU via Gateway\']" label="Conexión" variant="outlined" density="compact" hide-details style="min-width:150px;flex:0.5"></v-select>\n' +
'              <v-text-field v-if="newDevice.connType===\'TCP Directo\'" v-model="newDevice.ip" label="IP" variant="outlined" density="compact" hide-details style="min-width:150px;flex:1" placeholder="192.168.10.104"></v-text-field>\n' +
'              <v-select v-if="newDevice.connType===\'RTU via Gateway\'" v-model="newDevice.gateway" :items="gatewayNames" label="Gateway" variant="outlined" density="compact" hide-details style="min-width:150px;flex:0.7"></v-select>\n' +
'              <v-text-field v-if="newDevice.connType===\'RTU via Gateway\'" v-model.number="newDevice.slaveId" label="Slave ID" type="number" variant="outlined" density="compact" hide-details style="min-width:90px;flex:0.3" placeholder="1"></v-text-field>\n' +
'              <v-select v-model="newDevice.site" :items="[\'Agriplus\',\'Agrocaraya\']" label="Sitio" variant="outlined" density="compact" hide-details style="min-width:130px;flex:0.5"></v-select>\n' +
'              <v-btn color="green" @click="addDevice" prepend-icon="mdi-plus" :disabled="!canAddDevice">Agregar</v-btn>\n' +
'            </div>\n' +
'          </v-card-text>\n' +
'        </v-card>\n' +
'\n' +
'        <!-- DEVICE TABS -->\n' +
'        <v-tabs v-model="tab" color="primary" class="mb-4" show-arrows>\n' +
'          <v-tab v-for="(dr, i) in drives" :key="i" :value="i">\n' +
'            <v-icon start>{{dr.type===\'SSW900\'?\'mdi-rotate-right\':\'mdi-lightning-bolt\'}}</v-icon>{{ dr.name }}\n' +
'          </v-tab>\n' +
'        </v-tabs>\n' +
'\n' +
'        <v-window v-model="tab">\n' +
'          <v-window-item v-for="(dr, di) in drives" :key="di" :value="di">\n' +
'            <v-alert :type="dr.connType===\'RTU via Gateway\'?\'warning\':\'info\'" variant="tonal" density="compact" class="mb-3" style="font-family:monospace;font-size:0.85em">\n' +
'              {{ dr.name }} — {{ dr.connType===\'RTU via Gateway\' ? \'Gateway: \'+dr.gateway+\' | Slave ID: \'+dr.slaveId : dr.ip }} — {{ dr.site }}\n' +
'              <template v-slot:append>\n' +
'                <v-btn icon="mdi-delete" variant="text" color="red" size="small" @click="removeDevice(di)" title="Eliminar dispositivo"></v-btn>\n' +
'              </template>\n' +
'            </v-alert>\n' +
'\n' +
'            <!-- Connection settings -->\n' +
'            <v-card variant="outlined" rounded="lg" class="mb-3">\n' +
'              <v-card-title style="font-size:0.9em;font-weight:700;padding:8px 14px;background:#eff6ff;border-bottom:1px solid #e5e7eb"><v-icon start size="small">mdi-ethernet</v-icon>Conexión Modbus</v-card-title>\n' +
'              <v-card-text style="padding:8px 14px">\n' +
'                <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">\n' +
'                  <v-select v-model="dr.connType" :items="[\'TCP Directo\',\'RTU via Gateway\']" label="Tipo de Conexión" variant="outlined" density="compact" hide-details style="min-width:160px;flex:0.5"></v-select>\n' +
'                  <v-text-field v-if="dr.connType===\'TCP Directo\'" v-model="dr.ip" label="IP del Drive" variant="outlined" density="compact" hide-details style="min-width:160px;flex:1"></v-text-field>\n' +
'                  <v-select v-if="dr.connType===\'RTU via Gateway\'" v-model="dr.gateway" :items="gatewayNames" label="Gateway" variant="outlined" density="compact" hide-details style="min-width:160px;flex:0.7"></v-select>\n' +
'                  <v-text-field v-if="dr.connType===\'RTU via Gateway\'" v-model.number="dr.slaveId" label="Slave ID" type="number" variant="outlined" density="compact" hide-details style="min-width:90px;flex:0.3"></v-text-field>\n' +
'                </div>\n' +
'              </v-card-text>\n' +
'            </v-card>\n' +
'\n' +
'            <!-- Zone configs -->\n' +
'            <div v-for="(cfg, key) in dr.config" :key="key" style="margin-bottom:10px" v-show="!(dr.type===\'SSW900\' && (key===\'velocidad\' || key===\'frecuencia\'))">\n' +
'              <v-card variant="outlined" rounded="lg">\n' +
'                <v-card-title style="font-size:0.9em;font-weight:700;padding:8px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb">{{ cfg.label }} ({{ cfg.unit }})</v-card-title>\n' +
'                <v-card-text style="padding:8px 14px">\n' +
'                  <div style="display:grid;grid-template-columns:1fr 40px 1fr 1fr 40px 1fr 40px 1fr;gap:6px;align-items:end">\n' +
'                    <v-text-field v-model.number="cfg.min" label="Min" type="number" variant="outlined" density="compact" hide-details></v-text-field>\n' +
'                    <input type="color" v-model="cfg.c1" style="width:36px;height:36px;border:1px solid #ddd;cursor:pointer;border-radius:6px;padding:2px"/>\n' +
'                    <v-text-field v-model.number="cfg.green" label="Umbral 1" type="number" variant="outlined" density="compact" hide-details></v-text-field>\n' +
'                    <div></div>\n' +
'                    <input type="color" v-model="cfg.c2" style="width:36px;height:36px;border:1px solid #ddd;cursor:pointer;border-radius:6px;padding:2px"/>\n' +
'                    <v-text-field v-model.number="cfg.yellow" label="Umbral 2" type="number" variant="outlined" density="compact" hide-details></v-text-field>\n' +
'                    <input type="color" v-model="cfg.c3" style="width:36px;height:36px;border:1px solid #ddd;cursor:pointer;border-radius:6px;padding:2px"/>\n' +
'                    <v-text-field v-model.number="cfg.max" label="Max" type="number" variant="outlined" density="compact" hide-details></v-text-field>\n' +
'                  </div>\n' +
'                  <div style="display:flex;gap:2px;margin-top:6px;height:8px;border-radius:4px;overflow:hidden">\n' +
'                    <div :style="{flex:Math.max(cfg.green-cfg.min,1),background:cfg.c1}"></div>\n' +
'                    <div :style="{flex:Math.max(cfg.yellow-cfg.green,1),background:cfg.c2}"></div>\n' +
'                    <div :style="{flex:Math.max(cfg.max-cfg.yellow,1),background:cfg.c3}"></div>\n' +
'                  </div>\n' +
'                </v-card-text>\n' +
'              </v-card>\n' +
'            </div>\n' +
'\n' +
'            <div style="display:flex;gap:8px;margin-top:4px">\n' +
'              <v-btn color="primary" size="small" @click="saveAll" prepend-icon="mdi-content-save">Guardar</v-btn>\n' +
'              <v-btn variant="outlined" size="small" @click="resetDrive(di)" prepend-icon="mdi-restore">Defaults</v-btn>\n' +
'              <v-btn variant="text" size="small" @click="copyToAll(di)" prepend-icon="mdi-content-copy">Copiar a todos</v-btn>\n' +
'            </div>\n' +
'          </v-window-item>\n' +
'        </v-window>\n' +
'\n' +
'      </v-window-item>\n' +
'\n' +
'      <!-- ==================== GATEWAYS TAB ==================== -->\n' +
'      <v-window-item value="gateways">\n' +
'\n' +
'        <v-alert type="info" variant="tonal" density="compact" class="mb-4" style="font-size:0.85em">\n' +
'          <v-icon start>mdi-information</v-icon>\n' +
'          Configure los gateways serial-TCP (Moxa, USR, etc.) que convierten Modbus RTU a TCP para conectar los SSW900 y otros equipos RTU.\n' +
'        </v-alert>\n' +
'\n' +
'        <!-- ADD GATEWAY -->\n' +
'        <v-card variant="outlined" rounded="lg" class="mb-4">\n' +
'          <v-card-title style="font-size:0.95em;font-weight:700;padding:10px 16px;background:#eff6ff;border-bottom:1px solid #e5e7eb">\n' +
'            <v-icon start color="blue">mdi-plus-circle</v-icon> Agregar Gateway\n' +
'          </v-card-title>\n' +
'          <v-card-text style="padding:12px 16px">\n' +
'            <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">\n' +
'              <v-text-field v-model="newGw.name" label="Nombre" variant="outlined" density="compact" hide-details style="min-width:180px;flex:1" placeholder="Ej: Moxa Agriplus"></v-text-field>\n' +
'              <v-text-field v-model="newGw.ip" label="IP" variant="outlined" density="compact" hide-details style="min-width:150px;flex:0.7" placeholder="192.168.10.200"></v-text-field>\n' +
'              <v-text-field v-model.number="newGw.port" label="Puerto TCP" type="number" variant="outlined" density="compact" hide-details style="min-width:100px;flex:0.3"></v-text-field>\n' +
'              <v-select v-model="newGw.site" :items="[\'Agriplus\',\'Agrocaraya\']" label="Sitio" variant="outlined" density="compact" hide-details style="min-width:130px;flex:0.5"></v-select>\n' +
'              <v-select v-model="newGw.protocol" :items="[\'RTU over TCP\',\'ASCII over TCP\']" label="Protocolo" variant="outlined" density="compact" hide-details style="min-width:150px;flex:0.5"></v-select>\n' +
'              <v-btn color="blue" @click="addGateway" prepend-icon="mdi-plus" :disabled="!newGw.name||!newGw.ip">Agregar</v-btn>\n' +
'            </div>\n' +
'          </v-card-text>\n' +
'        </v-card>\n' +
'\n' +
'        <!-- GATEWAY LIST -->\n' +
'        <v-card v-for="(gw, gi) in gateways" :key="gi" variant="outlined" rounded="lg" class="mb-3">\n' +
'          <v-card-title style="font-size:0.95em;font-weight:700;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;align-items:center">\n' +
'            <v-icon start color="blue-darken-1">mdi-swap-horizontal</v-icon>\n' +
'            {{ gw.name }}\n' +
'            <v-chip size="x-small" color="blue" variant="tonal" class="ml-2">{{ gw.site }}</v-chip>\n' +
'            <v-spacer></v-spacer>\n' +
'            <v-btn icon="mdi-delete" variant="text" color="red" size="small" @click="removeGateway(gi)" title="Eliminar gateway"></v-btn>\n' +
'          </v-card-title>\n' +
'          <v-card-text style="padding:12px 16px">\n' +
'            <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px">\n' +
'              <v-text-field v-model="gw.name" label="Nombre" variant="outlined" density="compact" hide-details style="flex:1"></v-text-field>\n' +
'              <v-text-field v-model="gw.ip" label="IP" variant="outlined" density="compact" hide-details style="flex:0.7"></v-text-field>\n' +
'              <v-text-field v-model.number="gw.port" label="Puerto" type="number" variant="outlined" density="compact" hide-details style="flex:0.3"></v-text-field>\n' +
'              <v-select v-model="gw.protocol" :items="[\'RTU over TCP\',\'ASCII over TCP\']" label="Protocolo" variant="outlined" density="compact" hide-details style="flex:0.5"></v-select>\n' +
'              <v-select v-model="gw.baudrate" :items="[\'9600\',\'19200\',\'38400\',\'57600\',\'115200\']" label="Baudrate" variant="outlined" density="compact" hide-details style="flex:0.4"></v-select>\n' +
'            </div>\n' +
'\n' +
'            <!-- Devices connected to this gateway -->\n' +
'            <div style="font-size:0.8em;color:#666;font-weight:600;margin-bottom:6px">DISPOSITIVOS CONECTADOS:</div>\n' +
'            <div v-if="gwDevices(gi).length===0" style="font-size:0.85em;color:#bbb;font-style:italic;padding:8px 0">Ningún dispositivo asignado a este gateway</div>\n' +
'            <v-chip v-for="d in gwDevices(gi)" :key="d.name" size="small" color="blue" variant="tonal" class="mr-1 mb-1">\n' +
'              <v-icon start size="small">{{d.type===\'SSW900\'?\'mdi-rotate-right\':\'mdi-lightning-bolt\'}}</v-icon>\n' +
'              {{ d.name }} (ID: {{ d.slaveId }})\n' +
'            </v-chip>\n' +
'          </v-card-text>\n' +
'        </v-card>\n' +
'\n' +
'        <v-alert v-if="gateways.length===0" variant="tonal" type="warning" density="compact" style="font-size:0.85em">\n' +
'          No hay gateways configurados. Agregue uno para conectar dispositivos RTU.\n' +
'        </v-alert>\n' +
'\n' +
'        <v-btn v-if="gateways.length>0" color="primary" class="mt-2" @click="saveAll" prepend-icon="mdi-content-save">Guardar Gateways</v-btn>\n' +
'\n' +
'      </v-window-item>\n' +
'    </v-window>\n' +
'\n' +
'    <v-snackbar v-model="saved" color="success" timeout="2000">Guardado</v-snackbar>\n' +
'\n' +
'    <v-divider class="my-4"></v-divider>\n' +
'    <div style="display:flex;gap:12px;align-items:center;width:100%">\n' +
'      <v-icon color="warning">mdi-key</v-icon>\n' +
'      <v-text-field v-model="newPw" label="Nueva contraseña" type="password" variant="outlined" density="compact" hide-details style="flex:1"></v-text-field>\n' +
'      <v-btn color="warning" @click="changePw" prepend-icon="mdi-key">Cambiar Contraseña</v-btn>\n' +
'    </div>\n' +
'    <v-snackbar v-model="pwOk" color="warning" timeout="2000">Contraseña cambiada</v-snackbar>\n' +
'  </div>\n' +
'</div>\n' +
'</template>\n' +
'\n' +
'<script>\n' +
'export default {\n' +
'  data() {\n' +
'    var def = {velocidad:{min:0,max:1800,green:1200,yellow:1500,label:"Velocidad",unit:"RPM",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},corriente:{min:0,max:150,green:80,yellow:120,label:"Corriente",unit:"A",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},tension:{min:0,max:500,green:380,yellow:480,label:"Tensión",unit:"V",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},frecuencia:{min:0,max:70,green:50,yellow:62,label:"Frecuencia",unit:"Hz",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},potencia:{min:0,max:100,green:60,yellow:85,label:"Potencia",unit:"kW",c1:"#22c55e",c2:"#f59e0b",c3:"#ef4444"},temperatura:{min:-10,max:150,green:80,yellow:120,label:"Temp. Motor",unit:"°C",c1:"#3b82f6",c2:"#f59e0b",c3:"#ef4444"}};\n' +
'    function cp(o){return JSON.parse(JSON.stringify(o))}\n' +
'    return {\n' +
'      showLogin:true, authenticated:false, password:"", loginError:"",\n' +
'      saved:false, pwOk:false, newPw:"", tab:0, mainTab:"devices",\n' +
'      defaults: def,\n' +
'      newDevice: {name:"",type:"CFW900",ip:"",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1},\n' +
'      newGw: {name:"",ip:"",port:502,site:"Agriplus",protocol:"RTU over TCP",baudrate:"9600"},\n' +
'      gateways: [\n' +
'        {name:"Gateway Agriplus",ip:"192.168.10.200",port:502,site:"Agriplus",protocol:"RTU over TCP",baudrate:"9600"},\n' +
'        {name:"Gateway Agrocaraya",ip:"192.168.10.210",port:502,site:"Agrocaraya",protocol:"RTU over TCP",baudrate:"9600"}\n' +
'      ],\n' +
'      drives:[\n' +
'        {name:"CFW900 #1",type:"CFW900",ip:"192.168.10.100",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
'        {name:"CFW900 #2",type:"CFW900",ip:"192.168.10.101",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
'        {name:"CFW900 #3",type:"CFW900",ip:"192.168.10.102",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
'        {name:"CFW900 #4",type:"CFW900",ip:"192.168.10.103",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1,config:cp(def)},\n' +
'        {name:"SSW900 #1",type:"SSW900",ip:"",site:"Agriplus",connType:"RTU via Gateway",gateway:"Gateway Agriplus",slaveId:5,config:cp(def)},\n' +
'        {name:"SSW900 #2",type:"SSW900",ip:"",site:"Agriplus",connType:"RTU via Gateway",gateway:"Gateway Agriplus",slaveId:6,config:cp(def)},\n' +
'        {name:"SSW900 Agrocaraya",type:"SSW900",ip:"",site:"Agrocaraya",connType:"RTU via Gateway",gateway:"Gateway Agrocaraya",slaveId:7,config:cp(def)}\n' +
'      ]\n' +
'    }\n' +
'  },\n' +
'  computed: {\n' +
'    gatewayNames() { return this.gateways.map(function(g){ return g.name; }); },\n' +
'    canAddDevice() {\n' +
'      var d = this.newDevice;\n' +
'      if (!d.name) return false;\n' +
'      if (d.connType === "TCP Directo") return !!d.ip;\n' +
'      return !!d.gateway && d.slaveId > 0;\n' +
'    }\n' +
'  },\n' +
'  mounted(){this.send({topic:"load"})},\n' +
'  watch:{\n' +
'    msg(v){\n' +
'      if(v&&v.topic==="configFull"&&v.payload){\n' +
'        if(v.payload.drives) this.drives=v.payload.drives;\n' +
'        else if(Array.isArray(v.payload)) this.drives=v.payload;\n' +
'        if(v.payload.gateways) this.gateways=v.payload.gateways;\n' +
'      }\n' +
'      if(v&&v.topic==="auth"){\n' +
'        if(v.payload===true){this.authenticated=true;this.showLogin=false;this.loginError="";}\n' +
'        else this.loginError="Incorrecta";\n' +
'      }\n' +
'    }\n' +
'  },\n' +
'  methods:{\n' +
'    checkPassword(){this.send({topic:"auth",payload:this.password})},\n' +
'    gwDevices(gi){\n' +
'      var gwName = this.gateways[gi].name;\n' +
'      return this.drives.filter(function(d){ return d.connType==="RTU via Gateway" && d.gateway===gwName; });\n' +
'    },\n' +
'    saveAll(){\n' +
'      this.send({topic:"saveFull",payload:{drives:JSON.parse(JSON.stringify(this.drives)),gateways:JSON.parse(JSON.stringify(this.gateways))}});\n' +
'      this.saved=true;\n' +
'    },\n' +
'    addDevice(){\n' +
'      var d=this.newDevice;\n' +
'      if(!this.canAddDevice)return;\n' +
'      var resolvedIp = d.ip;\n' +
'      if(d.connType==="RTU via Gateway"){\n' +
'        var gw = this.gateways.find(function(g){return g.name===d.gateway;});\n' +
'        resolvedIp = gw ? gw.ip : "";\n' +
'      }\n' +
'      this.drives.push({\n' +
'        name:d.name, type:d.type, ip:resolvedIp, site:d.site,\n' +
'        connType:d.connType, gateway:d.gateway, slaveId:d.slaveId,\n' +
'        config:JSON.parse(JSON.stringify(this.defaults))\n' +
'      });\n' +
'      this.newDevice={name:"",type:"CFW900",ip:"",site:"Agriplus",connType:"TCP Directo",gateway:"",slaveId:1};\n' +
'      this.saveAll();\n' +
'      this.tab=this.drives.length-1;\n' +
'    },\n' +
'    removeDevice(idx){\n' +
'      if(confirm("¿Eliminar "+this.drives[idx].name+"?")){\n' +
'        this.drives.splice(idx,1); this.tab=0; this.saveAll();\n' +
'      }\n' +
'    },\n' +
'    addGateway(){\n' +
'      var g=this.newGw;\n' +
'      if(!g.name||!g.ip)return;\n' +
'      this.gateways.push(JSON.parse(JSON.stringify(g)));\n' +
'      this.newGw={name:"",ip:"",port:502,site:"Agriplus",protocol:"RTU over TCP",baudrate:"9600"};\n' +
'      this.saveAll();\n' +
'    },\n' +
'    removeGateway(idx){\n' +
'      var gwName=this.gateways[idx].name;\n' +
'      var used=this.drives.some(function(d){return d.gateway===gwName;});\n' +
'      if(used){alert("No se puede eliminar: hay dispositivos asignados a este gateway.");return;}\n' +
'      if(confirm("¿Eliminar gateway "+gwName+"?")){\n' +
'        this.gateways.splice(idx,1); this.saveAll();\n' +
'      }\n' +
'    },\n' +
'    resetDrive(i){\n' +
'      this.drives[i].config=JSON.parse(JSON.stringify(this.defaults));\n' +
'      this.saveAll();\n' +
'    },\n' +
'    copyToAll(src){\n' +
'      var s=JSON.stringify(this.drives[src].config);\n' +
'      for(var i=0;i<this.drives.length;i++)this.drives[i].config=JSON.parse(s);\n' +
'      this.saveAll();\n' +
'    },\n' +
'    changePw(){\n' +
'      if(this.newPw.length>=4){this.send({topic:"changePassword",payload:this.newPw});this.newPw="";this.pwOk=true;}\n' +
'    }\n' +
'  }\n' +
'}\n' +
'</script>';

console.log('Config form updated with Gateways tab');

// Update config handler to save/load gateways
var handler = f.find(function(n){ return n.id === 'weg_d2_config_handler'; });
if (handler) {
    handler.func = [
        'var topic = msg.topic;',
        'var payload = msg.payload;',
        '',
        'if (topic === "auth") {',
        '    var storedPw = global.get("adminPassword") || "admin123";',
        '    msg.topic = "auth";',
        '    msg.payload = (payload === storedPw);',
        '    return [msg, null];',
        '}',
        '',
        'if (topic === "changePassword") {',
        '    global.set("adminPassword", payload);',
        '    return [null, null];',
        '}',
        '',
        'if (topic === "load") {',
        '    var drives = global.get("driveConfig") || null;',
        '    var gateways = global.get("gatewayConfig") || null;',
        '    if (drives || gateways) {',
        '        msg.topic = "configFull";',
        '        msg.payload = { drives: drives, gateways: gateways };',
        '        return [msg, null];',
        '    }',
        '    return [null, null];',
        '}',
        '',
        'if (topic === "saveFull") {',
        '    var data = payload;',
        '    var driveList, gwList;',
        '    if (data.drives) {',
        '        driveList = data.drives;',
        '        gwList = data.gateways || [];',
        '    } else if (Array.isArray(data)) {',
        '        driveList = data;',
        '        gwList = global.get("gatewayConfig") || [];',
        '    } else {',
        '        return [null, null];',
        '    }',
        '',
        '    global.set("driveConfig", driveList);',
        '    global.set("gatewayConfig", gwList);',
        '',
        '    // Save gauge config per drive for the cards',
        '    var perDrive = {};',
        '    driveList.forEach(function(d, i) {',
        '        if (d.config) perDrive[i] = d.config;',
        '    });',
        '    global.set("gaugeConfigPerDrive", perDrive);',
        '',
        '    // Build provisioning message for new devices',
        '    var provMsg = null;',
        '    driveList.forEach(function(d, i) {',
        '        var resolvedIp = d.ip;',
        '        var unitId = d.slaveId || 1;',
        '        if (d.connType === "RTU via Gateway" && d.gateway && gwList) {',
        '            var gw = gwList.find(function(g){ return g.name === d.gateway; });',
        '            if (gw) {',
        '                resolvedIp = gw.ip;',
        '                // Port is handled by the Modbus client node',
        '            }',
        '        }',
        '        d._resolvedIp = resolvedIp;',
        '        d._unitId = unitId;',
        '    });',
        '',
        '    node.status({fill:"green",shape:"dot",text:"Saved " + driveList.length + " drives + " + gwList.length + " gateways"});',
        '    msg.topic = "saved";',
        '    msg.payload = "ok";',
        '',
        '    // Send provisioning data',
        '    provMsg = { topic: "provision", drives: driveList, gateways: gwList };',
        '    return [msg, provMsg];',
        '}',
        '',
        'return [null, null];'
    ].join('\n');
    handler.outputs = 2;
    if (!handler.wires) handler.wires = [[], []];
    while (handler.wires.length < 2) handler.wires.push([]);
    handler.wires[1] = ['weg_provisioner'];
    console.log('Config handler updated for gateways');
}

// Update provisioner to handle RTU via Gateway (resolve IP from gateway, set unit_id)
var prov = f.find(function(n){ return n.id === 'weg_provisioner'; });
if (prov) {
    prov.func = [
        '// Receives full drive + gateway config, provisions Modbus nodes',
        'if (!msg.drives) return null;',
        'var drives = msg.drives;',
        'var gateways = msg.gateways || [];',
        'var newNodes = [];',
        '',
        'drives.forEach(function(dev, i) {',
        '    var idx = i + 1;',
        '    var cfgId = "weg_mb_cfg_dyn_" + idx;',
        '    var readId = "weg_mb_read_dyn_" + idx;',
        '    var parserId = "weg_d2_parser_dyn_" + idx;',
        '    var yPos = 100 + i * 80;',
        '',
        '    // Resolve IP and unit ID',
        '    var targetIp = dev.ip;',
        '    var targetPort = "502";',
        '    var unitId = String(dev.slaveId || 1);',
        '',
        '    if (dev.connType === "RTU via Gateway" && dev.gateway) {',
        '        var gw = gateways.find(function(g){ return g.name === dev.gateway; });',
        '        if (gw) {',
        '            targetIp = gw.ip;',
        '            targetPort = String(gw.port || 502);',
        '        }',
        '    }',
        '',
        '    if (!targetIp) return;',
        '',
        '    // Modbus client',
        '    newNodes.push({',
        '        id: cfgId, type: "modbus-client", name: dev.name,',
        '        clienttype: "tcp", bufferCommands: true,',
        '        stateLogEnabled: false, queueLogEnabled: false, failureLogEnabled: true,',
        '        tcpHost: targetIp, tcpPort: targetPort, tcpType: "DEFAULT",',
        '        serialPort: "", serialType: "RTU-BUFFERD",',
        '        serialBaudrate: "9600", serialDatabits: "8",',
        '        serialStopbits: "1", serialParity: "none",',
        '        serialConnectionDelay: "100", serialAsciiResponseStartDelimiter: "0x3A",',
        '        unit_id: unitId, commandDelay: "1", clientTimeout: "1000",',
        '        reconnectOnTimeout: true, reconnectTimeout: "5000",',
        '        parallelUnitIdsAllowed: true,',
        '        showErrors: false, showWarnings: true, showLogs: false',
        '    });',
        '',
        '    // Modbus read',
        '    newNodes.push({',
        '        id: readId, type: "modbus-read", z: "weg_d2_tab",',
        '        name: "Read " + dev.name, topic: "",',
        '        showStatusActivities: true, logIOActivities: false,',
        '        showErrors: false, showWarnings: true,',
        '        unitid: unitId, dataType: "HoldingRegister",',
        '        adr: "0", quantity: dev.type==="SSW900" ? "65" : "70",',
        '        rate: "2", rateUnit: "s",',
        '        delayOnStart: false, startDelayTime: "",',
        '        server: cfgId, useIOFile: false, ioFile: "",',
        '        useIOForPayload: false, emptyMsgOnFail: false,',
        '        x: 220, y: yPos, wires: [[parserId], []]',
        '    });',
        '',
        '    // Parser (simplified - uses drive index)',
        '    var pFunc = dev.type==="SSW900"',
        '        ? "var r=msg.payload;if(!r||r.length<30)return null;var d=global.get(\\"cfwDevices\\")||[];var cur=(r[3]||0)/10;var st=r[6]||0;var v=r[7]||0;var pw=(r[10]||0)/100;d["+i+"]={name:\\""+dev.name+"\\",type:\\"SSW900\\",ip:\\""+targetIp+"\\",stateCode:st,motorSpeed:0,speedRef:0,frequency:0,current:cur,outputVoltage:v,power:pw,cosPhi:0,motorTemp:0,nominalCurrent:150,nominalVoltage:500,nominalFreq:0,hoursEnergized:\\"-\\",hoursEnabled:\\"-\\",online:true,running:st===1,ready:st===0,fault:st===3,hasFault:false,hasAlarm:false,faultText:\\"Sin Falla\\",alarmText:\\"\\",_lastUpdate:Date.now()};global.set(\\"cfwDevices\\",d);return null;"',
        '        : "var r=msg.payload;if(!r||r.length<50)return null;var d=global.get(\\"cfwDevices\\")||[];var spd=r[2]||0;var cur=(r[3]||0)/10;var frq=(r[5]||0)/10;var st=r[6]||0;var v=r[7]||0;var pw=(r[10]||0)/100;d["+i+"]={name:\\""+dev.name+"\\",type:\\"CFW900\\",ip:\\""+targetIp+"\\",stateCode:st,motorSpeed:spd,speedRef:r[1]||0,frequency:frq,current:cur,outputVoltage:v,power:pw,cosPhi:0,motorTemp:0,nominalCurrent:150,nominalVoltage:500,nominalFreq:70,hoursEnergized:\\"-\\",hoursEnabled:\\"-\\",online:true,running:st===1,ready:st===0,fault:st===3,hasFault:false,hasAlarm:false,faultText:\\"Sin Falla\\",alarmText:\\"\\",_lastUpdate:Date.now()};global.set(\\"cfwDevices\\",d);return null;";',
        '',
        '    newNodes.push({',
        '        id: parserId, type: "function", z: "weg_d2_tab",',
        '        name: "Parse " + dev.name, func: pFunc,',
        '        outputs: 1, x: 480, y: yPos, wires: [[]]',
        '    });',
        '});',
        '',
        'msg.newNodes = newNodes;',
        'msg.url = "http://127.0.0.1:1880/flows";',
        'msg.method = "GET";',
        'msg.headers = {"Content-Type": "application/json"};',
        'node.status({fill:"blue",shape:"dot",text:"Provisioning " + drives.length + " devices..."});',
        'return msg;'
    ].join('\n');
    console.log('Provisioner updated for gateway support');
}

fs.writeFileSync('/data/flows.json', JSON.stringify(f, null, 2));
console.log('Done - Gateway config tab added');

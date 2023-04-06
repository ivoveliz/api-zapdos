'use strict';
const express = require('express');
const Pool = require('pg').Pool
require('dotenv').config();
const Registry = require('azure-iothub').Registry;
const IoTHubTokenCredentials = require('azure-iothub').IoTHubTokenCredentials;
const DigitalTwinClient = require('azure-iothub').DigitalTwinClient;
const XLSX = require('xlsx');
const connectionString = process.env.CONECTION_STRING_IOTHUB
const cors = require('cors'); // Importar el paquete cors
const moment = require('moment-timezone');
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
})

const app = express();
app.use(cors());
const port =  process.env.PORT;
app.use(express.json()); // para analizar datos de solicitud en formato JSON
app.use(express.urlencoded({ extended: true })); // para analizar datos de solicitud URL-codificados
// Configuración de la conexión con la base de datos

// Definir las rutas


const jwt = require('jsonwebtoken');


// Ruta para la autenticación
app.post('/login', (req, res) => {
  const { username, password } = req.body;
//console.log(req.body)
  // Verificar si el nombre de usuario y la contraseña son correctos
  const username_env =  process.env.USER_LOGIN;
  const password_env =  process.env.PASSWORD_LOGIN;
  if (username === username_env && password === password_env ) {
    // Generar un token JWT
    const secretKey = process.env.SECRETKEY;
  const token = jwt.sign({ username }, secretKey, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Credenciales inválidas' });
  }
});
app.get('/', (req, res) => {
  res.json({ message: 'API Twin Data' });
});

app.get('/devices', (req, res) => {
  pool.query('SELECT * FROM twin_data', (error, results) => {
    if (error) {
      throw error;
    }
    if (results.rowCount === 0) {

      const registry = Registry.fromConnectionString(connectionString);
      const query = registry.createQuery('SELECT * FROM devices', 100);

      async function onResults(err, results) {
        if (err) {
          console.error('Failed to fetch the results: ' + err.message);
        } else {
          // Do something with the results
          results.forEach(async function(twin) {
      
            var deviceId=twin.deviceId
            var modelid=twin.properties.desired.modelid
            var entityid=twin.properties.desired.entityid
            var namedevice=twin.properties.desired.namedevice
          
      
            // Insert data into the PostgreSQL table
            const client = await pool.connect();
            try {
              await client.query('INSERT INTO public.twin_data (entityid, modelid,deviceId,namedevice,typedevice) VALUES ($1, $2,$3,$4,$5) ON CONFLICT (deviceId) DO UPDATE SET modelid = $2, entityid = $1,deviceId = $3,namedevice = $4,typedevice = $5', [twin.properties.desired.entityid, twin.properties.desired.modelid, twin.deviceId,twin.properties.desired.namedevice,twin.properties.desired.typedevice]);
      
              console.log('Data inserted successfully');
            } catch (err) {
              console.error(err);
            } finally {
              client.release();
            }
          });
      
          if (query.hasMoreResults) {
              query.nextAsTwin(onResults);
          }
        }
      }
      
      query.nextAsTwin(onResults);

      res.status(404).json({ message: 'No se encontraron dispositivos.' });
    } else {
      res.status(200).json(results.rows);
    }
  });
});

app.post('/devices/:deviceid', (req, res) => {
  const deviceid = req.params.deviceid;
  // console.log(deviceid )
  // console.log(req.body)
  const { modelid, entityid, namedevice,typedevice } = req.body;

  async function main() {
    const deviceId = deviceid
   
    // Create service client
    const credentials = new IoTHubTokenCredentials(connectionString);
    const digitalTwinClient = new DigitalTwinClient(credentials);
  
   
    const model = [{
      op: 'add',
      path: '/modelid',
      value: modelid
    }];
    await digitalTwinClient.updateDigitalTwin(deviceId, model);
  
    console.log('Patch device id has been succesfully applied');
  
    const Entity = [{
      op: 'add',
      path: '/entityid',
      value: entityid
    }];
    await digitalTwinClient.updateDigitalTwin(deviceId, Entity);
  
    console.log('Patch entity has been succesfully applied');
  
    const NameDevice= [{
      op: 'add',
      path: '/namedevice',
      value:  namedevice
    }];
    await digitalTwinClient.updateDigitalTwin(deviceId, NameDevice);
  
   
    const Typedevice= [{
      op: 'add',
      path: '/typedevice',
      value: typedevice
    }];
    await digitalTwinClient.updateDigitalTwin(deviceId, Typedevice);
    console.log('Patch typedevice has been succesfully applied');
  }

  
  main().catch((err) => {
    console.log('error code: ', err.code);
    console.log('error message: ', err.message);
    console.log('error stack: ', err.stack);
  });

  pool.query(
    'UPDATE twin_data SET modelid = $1, entityid = $2, namedevice = $3, typedevice = $5 WHERE deviceid = $4',
    [modelid, entityid, namedevice,deviceid,typedevice],
    (error, results) => {
      if (error) {
        throw error;
      }
      res.status(200).send(`Dispositivo con ID ${deviceid} actualizado exitosamente.`);
    }
  );
});

app.post('/devices/:deviceid/downlink', (req, res) => {
  const deviceId = req.params.deviceid;
  pool.query('SELECT * FROM twin_data WHERE deviceid = $1', [deviceId], (error, results) => {
    if (error) {
      throw error;
    }
    if (results.rowCount === 0) {
      res.status(404).json({ message: 'Dispositivo no encontrado' });
    } else {
      console.log(`Enviando downlink al dispositivo: ${deviceId}`);
      res.json({ message: 'Downlink enviado' });
    }
  });
});

app.get('/download-excel-level', async (req, res) => {
  const apiKey = req.query.keyapi;
  const validApiKey = process.env.VALID_API_KEY;
  //console.log(req.query.keyapi, validApiKey.toString());

  if (apiKey !== validApiKey.toString()) {
    res.status(401).send('Invalid API key');
    return;
  }

  const entidadid = req.query['var-Entidad'];
  const namedevice = req.query['var-namedevice'];
  const timereport = req.query['timereport'];
  const twinDataTable = await pool.query('SELECT deviceid FROM public.twin_data WHERE entityid=$1 AND namedevice=$2', [entidadid, namedevice]);
  const device_id = twinDataTable.rows[0].deviceid;
  
  
  const currentTime = new Date();
  const sixHoursAgo = new Date(currentTime - timereport * 60 * 60 * 1000); // 6 hours ago
  const fecha = moment.tz(currentTime, 'America/Santiago').format('YYYY-MM-DD HH:mm:ss');

  const keepAliveListTable = await pool.query('SELECT to_char(created_at AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Santiago\', \'YYYY-MM-DD HH24:MI:SS\') AS "fecha dato", data ->> \'distance_Meters\' AS "distancia metros", data ->> \'battery_v\' AS "voltage bateria", CONCAT(ROUND(CAST(data ->> \'battery_v\' AS NUMERIC) / 4 * 100, 2), \'%\') AS "porcentaje bateria" FROM public.iotdata WHERE device_id=$1 AND created_at >= $2 ORDER BY id DESC', [device_id, sixHoursAgo]);

  const data = keepAliveListTable.rows;

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, namedevice);
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const filename = `${namedevice}-${entidadid}-${fecha}.xlsx`;

  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(excelBuffer);
});

app.get('/download-excel-entidad', async (req, res) => {
  const apiKey = req.query.keyapi;
  const validApiKey = process.env.VALID_API_KEY;
  console.log(req.query.keyapi, validApiKey.toString());

  if (apiKey !== validApiKey.toString()) {
    res.status(401).send('Invalid API key');
    return;
  }

  const entidadid = req.query['var-Entidad'];
  const timereport = req.query['timereport'];
  const sensornivel=req.query['var-sensornivel'];
  const dibomba= req.query['var-dibomba'];
  const flujometro= req.query['var-flujometrosolucion'];
  const twinDataTable = await pool.query('SELECT deviceid,modelid,namedevice FROM public.twin_data WHERE entityid=$1 ', [entidadid]);
  const device_id = twinDataTable.rows;
//console.log(device_id)

const group1 = device_id.filter(device => device.modelid === 'LDDS75' );
const group2 = device_id.filter(device => device.modelid === '17');

 console.log("LDDS75",group1)
 console.log("12",group2)

const currentTime = new Date();
const sixHoursAgo = new Date(currentTime - timereport * 60 * 60 * 1000); // 6 hours ago
const fecha = moment.tz(currentTime, 'America/Santiago').format('YYYY-MM-DD HH:mm:ss');
let keepAliveListTableLevel
let keepAliveListTable
let EstatusBomba
let ValorFlujometro

if(group1[0].modelid=="LDDS75"){
  var DeviceIdLevel=group1[0].deviceid
  keepAliveListTableLevel = await pool.query('SELECT to_char(created_at AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Santiago\', \'YYYY-MM-DD HH24:MI:SS\') AS "fecha dato",  data ->> \'distance_Meters\' AS "distancia metros", data ->> \'battery_v\' AS "voltaje bateria", CONCAT(ROUND(CAST(data ->> \'battery_v\' AS NUMERIC) / 4 * 100, 2), \'%\') AS "porcentaje bateria" FROM public.iotdata WHERE device_id=$1 AND created_at >= $2 ORDER BY id DESC ', [DeviceIdLevel, sixHoursAgo]);
  //console.log(keepAliveListTableLevel.rows)
}

if(group2[0].modelid=="17"){
  var DeviceIdBond=group2[0].deviceid
  //console.log(DeviceIdBond)
  // keepAliveListTable = await pool.query('SELECT to_char(created_at AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Santiago\', \'YYYY-MM-DD HH24:MI:SS\') AS "fecha dato", data ->> \'flow\' AS "flujo instantaneo", data ->> \'flow_units\' AS "Unidad Flujo", data ->> \'totalizer_1\' AS "Totalizador 1", data ->> \'totalizer_2\' AS "Totalizador 2", data ->> \'totalizer_3\' AS "Totalizador 3",data ->> \'totalizer_3\' AS "Totalizador 3",data ->> \'totalizer_units\' AS "Unidad Totalizador",data ->> \'di\' AS "Estatus bomba",data ->> \'battery_lvl_flowmeter\' AS "Bateria FLujometro" FROM public.iotdata WHERE device_id=$1 AND created_at >= $2  ORDER BY id DESC', [DeviceIdBond, sixHoursAgo]);
  //console.log(keepAliveListTable.rows)
  keepAliveListTable = await pool.query('SELECT to_char(created_at AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Santiago\', \'YYYY-MM-DD HH24:MI:SS\') AS "fecha dato", data ->> \'flow\' AS "flujo instantaneo", data ->> \'flow_units\' AS "Unidad Flujo", data ->> \'totalizer_1\' AS "Totalizador 1", data ->> \'totalizer_2\' AS "Totalizador 2", data ->> \'totalizer_3\' AS "Totalizador 3",data ->> \'totalizer_3\' AS "Totalizador 3",data ->> \'totalizer_units\' AS "Unidad Totalizador",data ->> \'di\' AS "Estatus bomba",data ->> \'battery_lvl_flowmeter\' AS "Bateria FLujometro" FROM public.iotdata WHERE device_id=$1 AND created_at >= $2 AND jsonb_extract_path_text(data, \'status_request\') = \'true\' ORDER BY id DESC', [DeviceIdBond, sixHoursAgo]);


   EstatusBomba = keepAliveListTable.rows.map(dato => ({
    'fecha dato': dato['fecha dato'],
    'Estatus bomba': dato['Estatus bomba']
  }));

  ValorFlujometro = keepAliveListTable.rows.map(dato => ({
    'fecha dato': dato['fecha dato'],
    'flujo instantaneo': dato['flujo instantaneo'],
    'Unidad Flujo': dato['Unidad Flujo'],
    'Totalizador 1': dato['Totalizador 1'],
    'Totalizador 2': dato['Totalizador 2'],
    'Totalizador 3': dato['Totalizador 3'],
    'Unidad Totalizador': dato['Unidad Totalizador'],
    'Bateria FLujometro': dato['Bateria FLujometro'],

  }));
  
  
}


  //const keepAliveListTable = await pool.query('SELECT to_char(created_at AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Santiago\', \'YYYY-MM-DD HH24:MI:SS\') AS "fecha dato", device_id, data ->> \'distance_Meters\' AS "distancia metros", data ->> \'battery_v\' AS "voltage bateria", CONCAT(ROUND(CAST(data ->> \'battery_v\' AS NUMERIC) / 4 * 100, 2), \'%\') AS "porcentaje bateria" FROM public.iotdata WHERE device_id=$1 AND created_at >= $2 ORDER BY id DESC', [device_id, sixHoursAgo]);

  // const data = keepAliveListTable.rows;

  const workbook = XLSX.utils.book_new();
  const sheet1 = XLSX.utils.json_to_sheet(keepAliveListTableLevel.rows);
const sheet2 = XLSX.utils.json_to_sheet(EstatusBomba);
const sheet3 = XLSX.utils.json_to_sheet(ValorFlujometro);
XLSX.utils.book_append_sheet(workbook, sheet1, sensornivel);
XLSX.utils.book_append_sheet(workbook, sheet2, dibomba);
XLSX.utils.book_append_sheet(workbook, sheet3, flujometro );

  // const workbook = XLSX.utils.book_new();
  // XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
   const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

   const filename = `${entidadid}-${fecha}.xlsx`;

   res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

 res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   res.send(excelBuffer);
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});

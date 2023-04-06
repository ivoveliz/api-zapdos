const express = require('express');
const router = express.Router();

// Definir las rutas
router.get('/', (req, res) => {
  res.json({ message: 'Lista de dispositivos', devices });
});

router.put('/:id', (req, res) => {
  const deviceId = req.params.id;
  const deviceIndex = devices.findIndex(device => device.deviceid === deviceId);
  if (deviceIndex === -1) {
    res.status(404).json({ message: 'Dispositivo no encontrado' });
  } else {
    devices[deviceIndex] = { ...devices[deviceIndex], ...req.body };
    res.json({ message: 'Dispositivo actualizado', device: devices[deviceIndex] });
  }
});

router.post('/:id/downlink', (req, res) => {
  const deviceId = req.params.id;
  const deviceIndex = devices.findIndex(device => device.deviceid === deviceId);
  if (deviceIndex === -1) {
    res.status(404).json({ message: 'Dispositivo no encontrado' });
  } else {
    console.log(`Enviando downlink al dispositivo: ${devices[deviceIndex].deviceid}`);
    res.json({ message: 'Downlink enviado' });
  }
});

// Exportar el router
module.exports = router;

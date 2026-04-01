const net = require('net');

function readRegs(callback) {
    const client = new net.Socket();
    const buf = Buffer.alloc(12);
    buf.writeUInt16BE(1, 0);
    buf.writeUInt16BE(0, 2);
    buf.writeUInt16BE(6, 4);
    buf.writeUInt8(1, 6);
    buf.writeUInt8(3, 7);
    buf.writeUInt16BE(42, 8);
    buf.writeUInt16BE(5, 10);

    let response = Buffer.alloc(0);

    client.connect(502, '192.168.10.100', () => {
        client.write(buf);
    });

    client.on('data', (data) => {
        response = Buffer.concat([response, data]);
        if (response.length >= 19) {
            const r42 = response.readUInt16BE(9);
            const r46 = response.readUInt16BE(17);
            callback(r42, r46);
            client.destroy();
        }
    });

    client.on('error', (err) => {
        callback(-1, -1);
    });
}

readRegs((e1, h1) => {
    console.log('T=0s   Reg42(Energizado):', e1, '  Reg46(Habilitado):', h1);

    setTimeout(() => {
        readRegs((e2, h2) => {
            console.log('T=15s  Reg42(Energizado):', e2, '  Reg46(Habilitado):', h2);
            console.log('');
            console.log('Delta Reg42:', e2 - e1, 'in 15 seconds');
            console.log('Delta Reg46:', h2 - h1, 'in 15 seconds');

            if (e2 - e1 >= 13 && e2 - e1 <= 17) {
                console.log('>> CONFIRMED: Values are in SECONDS');
                console.log('>> Energizado:', (e2 / 3600).toFixed(1), 'hours');
                console.log('>> Habilitado:', (h2 / 3600).toFixed(1), 'hours');
            } else if (e2 - e1 === 0) {
                console.log('>> Values are in HOURS (no change in 15s)');
            } else {
                console.log('>> Unknown unit, delta:', e2 - e1);
            }
            process.exit(0);
        });
    }, 15000);
});

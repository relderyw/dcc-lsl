const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb';

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    console.log('Sheets:', workbook.SheetNames);
    
    workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`\nHeaders for [${name}]:`);
        console.log(data[0]);
        console.log('Sample Row:');
        console.log(data[1]);
    });
} catch (e) {
    console.error(e);
}

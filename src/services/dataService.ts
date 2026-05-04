/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CarRecord {
  carId: string;      // CARRO
  model: string;      // CRRMOD
  status: string;     // STATUS
  sectorId: string;   // SETOR
  sectorName: string; // DSC_SETOR
  location: string;   // LOC_FISICA
  carPhysical: string;// CAR_FISICO
  embarkDate: string; // DT_EMB
  embarkTime: string; // HORAEMB
  registrationDate: string; // CADASTRO
  registrationTime: string; // HORA_CA
  VALOR_TOTAL_CARRO: number;
}

class DataService {
  private records: CarRecord[] = [];

  constructor() {
    // Initial mock data based on user's provided spreadsheet snippet
    this.records = [
      { carId: 'C8646185', model: 'K2G', status: 'CHECK DCC', sectorId: '050010712', sectorName: 'SOLD.TQ.L1', location: 'PICK-06-02', carPhysical: 'C8646183', embarkDate: '18/08/2025', embarkTime: '17:22' },
      { carId: 'C8655751', model: 'K1S', status: 'FORMATADO', sectorId: '100017205', sectorName: 'MONT. RODA', location: 'PICK-03-01', carPhysical: '', embarkDate: '15/08/2025', embarkTime: '21:24' },
      { carId: 'C8656518', model: 'K1H 060NS', status: 'CHECK DCC', sectorId: '050010718', sectorName: 'SOLDA CHASSI', location: 'PICK-06-02', carPhysical: 'C8656518', embarkDate: '15/08/2025', embarkTime: '22:24' },
      { carId: 'C8737161', model: 'K1H 050NS', status: 'CHECK DCC', sectorId: '050010809', sectorName: 'PINT.TQVZ2', location: 'ALAN', carPhysical: 'C8737374', embarkDate: '21/08/2025', embarkTime: '09:18' },
      { carId: 'C8737750', model: 'K99', status: 'CHECK DCC', sectorId: '050011102', sectorName: 'L. MONT. 2', location: 'MARCO', carPhysical: 'C8739144', embarkDate: '26/08/2025', embarkTime: '10:30' },
    ];
  }

  getRecords() {
    return this.records;
  }

  getRecordsByLocation(location: string) {
    return this.records.filter(r => r.location === location);
  }

  importJSON(data: any[]) {
    const mapping: Record<string, keyof CarRecord> = {
      'CARRO': 'carId',
      'CRRMOD': 'model',
      'STATUS': 'status',
      'SETOR': 'sectorId',
      'DSC_SETOR': 'sectorName',
      'LOC_FISICA': 'location',
      'CAR_FISICO': 'carPhysical',
      'DT_EMB': 'embarkDate',
      'HORAEMB': 'embarkTime',
      'CADASTRO': 'registrationDate',
      'HORA_CA': 'registrationTime',
      'VALOR_TOTAL_CARRO': 'VALOR_TOTAL_CARRO'
    };

    const newRecords: CarRecord[] = data.map(item => {
      const record: any = {};
      Object.keys(mapping).forEach(excelKey => {
        const appKey = mapping[excelKey];
        record[appKey] = item[excelKey]?.toString().trim() || '';
      });
      return record as CarRecord;
    });

    this.records = newRecords;
    return this.records;
  }

  importCSV(csvText: string) {
    const lines = csvText.split('\n');
    const headers = lines[0].split('\t'); // Assuming tab-separated from Excel copy-paste
    
    const newRecords: CarRecord[] = lines.slice(1).filter(line => line.trim()).map(line => {
      const values = line.split('\t');
      const record: any = {};
      
      const mapping: Record<string, keyof CarRecord> = {
        'CARRO': 'carId',
        'CRRMOD': 'model',
        'STATUS': 'status',
        'SETOR': 'sectorId',
        'DSC_SETOR': 'sectorName',
        'LOC_FISICA': 'location',
        'CAR_FISICO': 'carPhysical',
        'DT_EMB': 'embarkDate',
        'HORAEMB': 'embarkTime',
        'CADASTRO': 'registrationDate',
        'HORA_CA': 'registrationTime',
        'VALOR_TOTAL_CARRO': 'VALOR_TOTAL_CARRO'
      };

      headers.forEach((header, index) => {
        const key = mapping[header.trim()];
        if (key) {
          record[key] = values[index]?.trim();
        }
      });

      return record as CarRecord;
    });

    this.records = newRecords;
    return this.records;
  }
}

export const dataService = new DataService();

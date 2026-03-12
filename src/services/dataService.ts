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
}

class DataService {
  private records: CarRecord[] = [];

  constructor() {
    // Initial mock data based on user's provided spreadsheet snippet
    this.records = [
      { carId: 'C8646185', model: 'K2G', status: 'CHECK DCC', sectorId: '050010712', sectorName: 'SOLD.TQ.L1', location: 'PICK-06-02', carPhysical: 'C8646183', embarkDate: '18/08/2025', embarkTime: '17:22' },
      { carId: 'C8655751', model: 'K1S', status: 'FORMATADO', sectorId: '100017205', sectorName: 'MONT. RODA', location: 'PICK-03-01', carPhysical: '', embarkDate: '15/08/2025', embarkTime: '21:24' },
      { carId: 'C8656518', model: 'K1H 060NS', status: 'CHECK DCC', sectorId: '050010718', sectorName: 'SOLDA CHASSI', location: 'PICK-06-02', carPhysical: 'C8656518', embarkDate: '15/08/2025', embarkTime: '22:24' },
      { carId: 'C8669249', model: 'COMUM', status: 'CHECK DCC', sectorId: '050010721', sectorName: 'SOCHA C L2', location: 'PICK-06-01', carPhysical: 'C8669177', embarkDate: '15/08/2025', embarkTime: '08:25' },
      { carId: 'C8670185', model: 'K2G', status: 'CHECK DCC', sectorId: '050010424', sectorName: 'USIN.CARC2', location: 'PICK-07-03', carPhysical: 'C8670170', embarkDate: '15/08/2025', embarkTime: '19:47' },
      { carId: 'C8677615', model: 'K68 B01NS', status: 'CHECK DCC', sectorId: '100017118', sectorName: 'S.ESCAP L1', location: 'PICK-06-05', carPhysical: 'C8677492', embarkDate: '15/08/2025', embarkTime: '22:53' },
      { carId: 'C8684076', model: 'ZCW', status: 'EMBARCADO', sectorId: '050010974', sectorName: 'EMB.PROD.F', location: 'PICK-09-01', carPhysical: 'C8684458', embarkDate: '19/08/2025', embarkTime: '15:40' },
      { carId: 'C8684471', model: 'K68', status: 'CHECK DCC', sectorId: '100017205', sectorName: 'MONT. RODA', location: 'PICK-05-03', carPhysical: 'C8684409', embarkDate: '21/08/2025', embarkTime: '00:03' },
      { carId: 'C8686349', model: 'K0W B01NS', status: 'EMBARCADO', sectorId: '050010805', sectorName: 'PINT.FX.TQ', location: 'PICK-09-01', carPhysical: 'C8686349', embarkDate: '20/08/2025', embarkTime: '15:43' },
      { carId: 'C8703770', model: 'K2G', status: 'CHECK DCC', sectorId: '050010730', sectorName: 'SOCHA CHAPA', location: 'PICK-06-03', carPhysical: 'C8703757', embarkDate: '21/08/2025', embarkTime: '13:50' },
      { carId: 'C8719685', model: 'K1H 050NS', status: 'CHECK DCC', sectorId: '050010718', sectorName: 'SOLDA CHASSI', location: 'PICK-05-02', carPhysical: 'C8719685', embarkDate: '20/08/2025', embarkTime: '18:32' },
      { carId: 'C8723130', model: 'COMUM', status: 'FORMATADO', sectorId: '050010721', sectorName: 'SOCHA C L2', location: 'PICK-05-04', carPhysical: 'C8723130', embarkDate: '22/08/2025', embarkTime: '07:18' },
      { carId: 'C8725542', model: 'MLR B09NS', status: 'CHECK DCC', sectorId: '050010904', sectorName: 'PIN.ABS H2', location: 'PICK-09-03', carPhysical: 'C8726353', embarkDate: '22/08/2025', embarkTime: '09:37' },
      { carId: 'C8730189', model: 'K3H', status: 'CHECK DCC', sectorId: '050011202', sectorName: 'CX. ACESS.', location: 'PICK-09-01', carPhysical: 'C8735301', embarkDate: '26/08/2025', embarkTime: '15:06' },
      { carId: 'C8730711', model: 'K0W B01NS', status: 'CHECK DCC', sectorId: '050011202', sectorName: 'CX. ACESS.', location: 'PICK-09-02', carPhysical: 'C8730711', embarkDate: '22/08/2025', embarkTime: '19:35' },
      { carId: 'C8733507', model: 'K2G B02NS', status: 'CHECK DCC', sectorId: '050010809', sectorName: 'PINT.TQVZ2', location: 'PICK-06-01', carPhysical: 'C8733507', embarkDate: '18/08/2025', embarkTime: '17:29' },
      { carId: 'C8733702', model: 'K62', status: 'CHECK DCC', sectorId: '050010718', sectorName: 'SOLDA CHASSI', location: 'PICK-06-01', carPhysical: 'C8733701', embarkDate: '27/08/2025', embarkTime: '08:45' },
      { carId: 'C8736952', model: 'K62', status: 'CHECK DCC', sectorId: '050011207', sectorName: 'EMB.MET H2', location: 'PICK-18-09', carPhysical: 'C8736952', embarkDate: '22/08/2025', embarkTime: '16:00' },
      { carId: 'C8737161', model: 'K1H 050NS', status: 'CHECK DCC', sectorId: '050010809', sectorName: 'PINT.TQVZ2', location: 'PICK-06-02', carPhysical: 'C8737374', embarkDate: '21/08/2025', embarkTime: '09:18' },
      { carId: 'C8737750', model: 'K99', status: 'CHECK DCC', sectorId: '050011102', sectorName: 'L. MONT. 2', location: 'PICK-07-02', carPhysical: 'C8739144', embarkDate: '26/08/2025', embarkTime: '10:30' },
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
      'HORAEMB': 'embarkTime'
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
      
      // Map based on the headers provided in the image
      // CARRO	CRRMOD	STATUS	SETOR	DSC_SETOR	LOC_FISICA	CAR_FISICO	DATAEMB	DT_EMB	HORAEMB
      const mapping: Record<string, keyof CarRecord> = {
        'CARRO': 'carId',
        'CRRMOD': 'model',
        'STATUS': 'status',
        'SETOR': 'sectorId',
        'DSC_SETOR': 'sectorName',
        'LOC_FISICA': 'location',
        'CAR_FISICO': 'carPhysical',
        'DT_EMB': 'embarkDate',
        'HORAEMB': 'embarkTime'
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

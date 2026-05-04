import pandas as pd

file_path = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb'

def inspect():
    with pd.ExcelFile(file_path, engine='pyxlsb') as xls:
        print(f"Sheets: {xls.sheet_names}")
        for sheet_name in xls.sheet_names:
            if sheet_name in ['RW_EXPED', 'RW_EXPED2', 'PROJRSITEM']:
                df = pd.read_excel(xls, sheet_name=sheet_name, nrows=5)
                print(f"\nHeaders for [{sheet_name}]:")
                print(df.columns.tolist())
                print("Sample Data:")
                print(df.head(2))

if __name__ == "__main__":
    inspect()

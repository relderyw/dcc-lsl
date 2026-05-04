import pandas as pd

file_path = 'w:\\PYTHON\\PICKING\\PICKING_v1.xlsb'

def final_inspect():
    with pd.ExcelFile(file_path, engine='pyxlsb') as xls:
        for s in ['RW_EXPED', 'RW_EXPED2', 'PROJRSITEM']:
            df = pd.read_excel(xls, sheet_name=s, nrows=0)
            print(f"\n--- {s} ---")
            for i, col in enumerate(df.columns):
                # Calcular letra da coluna (A, B, C... AA, AB...)
                col_letter = ""
                temp_i = i
                while temp_i >= 0:
                    col_letter = chr(65 + (temp_i % 26)) + col_letter
                    temp_i = (temp_i // 26) - 1
                print(f"{i+1} ({col_letter}): {col}")

if __name__ == "__main__":
    final_inspect()

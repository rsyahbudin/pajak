const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const oracledb = require("oracledb");
const path = require("path"); // Import module 'path'
const fs = require("fs");
const csv = require("fast-csv");
const nodemailer = require("nodemailer");
const https = require("https");
const bodyParser = require("body-parser");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const Buffer = require("buffer").Buffer;
const schedule = require("node-schedule");

const app = express();
const port = 3001;

// SERVER CONNECTION
// const options = {
//    key: fs.readFileSync('/etc/apache2/cert/TRI_SSL_07-09_2023_Private_Key.key'),
//    cert: fs.readFileSync('/etc/apache2/cert/TRI_SSL_07-09_2023_CACert-Bundle.crt')
//  };

//  const server = https.createServer(options, app);

app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = mysql.createConnection({
   host: "10.21.9.234",
   port: 3306,
   user: "itapps",
   password: "itapps123@",
   database: "faktur-pajak",

   // host: "localhost",
   // port: 3306,
   // user: "root",
   // password: "",
   // database: "user_faktur",
});

// Koneksi ke MySQL
db.connect((err) => {
   if (err) {
      console.error("Error connecting to MySQL database:", err);
   } else {
      console.log("Connected to MySQL database.");
   }
});

// Konfigurasi koneksi Oracle
const oracleConfig = {
   user: "TRANSRETAIL",
   password: "TRANSRETAIL",
   connectString:
      "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db124.id007.trid-corp.net)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=POSSDB)))",
};

const uploads = multer({
   limits: {
      fileSize: 1024 * 1024 * 2, // 5MB
   },
   fileFilter(req, file, cb) {
      if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
         cb(null, true);
      } else {
         cb(new Error("Please upload an image (JPEG or JPG)."));
      }
   },
   storage: multer.memoryStorage(), // Store files in memory instead of disk
});

app.post(
   "/api/submit-form",
   uploads.fields([
      { name: "TT_FOTO_NPWP", maxCount: 1 },
      { name: "TT_FOTO_TRX", maxCount: 1 },
   ]),
   async (req, res) => {
      const {
         TT_TRXNO,
         TT_NAMA,
         TT_EMAIL,
         TT_NOHP,
         TT_NPWP,
         TT_NAMA_PT,
         TT_ALAMAT_PT,
      } = req.body;
      const TT_FOTO_NPWP = req.files["TT_FOTO_NPWP"][0];
      const TT_FOTO_TRX = req.files["TT_FOTO_TRX"][0];

      // Periksa apakah ID transaksi ada dalam database Oracle
      const checkTransactionQuery = `SELECT pt.id FROM POS_TRANSACTION pt WHERE pt.id = :TRXNO`;
      const checkDurationQuery = `SELECT trunc(sysdate) - trunc(SALES_DATE) AS duration FROM POS_TRANSACTION WHERE id = :TRXNO`;
      let connection;
      try {
         // Membuat koneksi ke Oracle
         connection = await oracledb.getConnection(oracleConfig);
         const checkTransactionResult = await connection.execute(
            checkTransactionQuery,
            { TRXNO: TT_TRXNO }
         );

         // Jika ID transaksi ditemukan dalam database Oracle
         if (checkTransactionResult.rows.length > 0) {
            // Periksa durasi sejak tanggal transaksi
            const checkDurationResult = await connection.execute(
               checkDurationQuery,
               { TRXNO: TT_TRXNO }
            );
            const duration = checkDurationResult.rows[0][0];

            if (duration > 90) {
               console.error("Transaction ID is older than 90 days.");
               res.status(400).json({
                  message: "ID Transaksi sudah lebih dari 90 hari",
               });
               return;
            }
            // Ambil informasi terkait dari Oracle berdasarkan TRXNO
            const oracleDataQuery = `
            SELECT s2.NAME AS STORE_NAME, TO_CHAR(pt.SALES_DATE,'YYYY-MM-DD') AS SALES_DATE, pt.TOTAL_AMOUNT_PAID 
            FROM POS_TRANSACTION pt 
            LEFT JOIN STORE s2 ON s2.STORE_ID=pt.STORE_ID 
            WHERE pt.id=:TRXNO
         `;
            const oracleDataResult = await connection.execute(oracleDataQuery, {
               TRXNO: TT_TRXNO,
            });

            // Cek apakah data ditemukan di Oracle
            if (oracleDataResult.rows.length > 0) {
               const [oracleData] = oracleDataResult.rows;

               // Ambil data dari Oracle
               const [TT_STORE, TT_SALES_DATE, TT_TOTAL_AMOUNT_PAID] =
                  oracleData;

               // Simpan path file ke dalam variabel
               const npwpPath = `./uploads/npwp/${TT_TRXNO}_npwp.${
                  TT_FOTO_NPWP.mimetype.split("/")[1]
               }`;
               const trxPath = `./uploads/struk/${TT_TRXNO}_struk.${
                  TT_FOTO_TRX.mimetype.split("/")[1]
               }`;

               // Insert data ke MySQL jika TT_TRXNO belum ada
               const insertQuery = `
INSERT INTO trx_tiket (TT_TRXNO, TT_NAMA, TT_EMAIL, TT_NOHP, TT_NPWP, TT_NAMA_PT, TT_ALAMAT_PT, TT_STATUS, TT_STORE, TT_SALES_DATE, TT_TOTAL_AMOUNT_PAID,TT_INSERT_USER, TT_FOTO_NPWP, TT_FOTO_TRX) 
SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? 
WHERE NOT EXISTS (SELECT 1 FROM trx_tiket WHERE TT_TRXNO = ?)
`;
               const status = "W"; // Set status menjadi "Waiting Validate"
               const insertUser = "CUSTOMER";
               db.query(
                  insertQuery,
                  [
                     TT_TRXNO,
                     TT_NAMA,
                     TT_EMAIL,
                     TT_NOHP,
                     TT_NPWP,
                     TT_NAMA_PT,
                     TT_ALAMAT_PT,
                     status,
                     TT_STORE,
                     TT_SALES_DATE,
                     TT_TOTAL_AMOUNT_PAID,
                     insertUser,
                     npwpPath,
                     trxPath,
                     TT_TRXNO, // Untuk menggunakan TT_TRXNO dalam subquery WHERE NOT EXISTS
                  ],
                  async (err, result) => {
                     if (err) {
                        console.error("Error submitting form:", err);
                        res.status(500).json({ message: err.message });
                        return;
                     }
                     if (result.affectedRows === 0) {
                        // Jika TT_TRXNO sudah ada, kembalikan respon dengan status konflik
                        console.error("Duplicate Transaction ID:", TT_TRXNO);
                        res.status(409).json({
                           message: "Duplicate Transaction ID",
                        });
                        return;
                     }

                     console.log("Form submitted successfully.");
                     try {
                        await fs.promises.writeFile(
                           npwpPath,
                           TT_FOTO_NPWP.buffer
                        );
                        await fs.promises.writeFile(
                           trxPath,
                           TT_FOTO_TRX.buffer
                        );
                        // Kirim email konfirmasi
                        await sendConfirmationEmail(
                           TT_EMAIL,
                           TT_NAMA,
                           TT_TRXNO,
                           TT_NOHP,
                           TT_NPWP,
                           TT_NAMA_PT,
                           TT_ALAMAT_PT
                        );

                        res.status(200).json({
                           message:
                              "Form submitted successfully. Confirmation email sent and MySQL data updated.",
                        });
                     } catch (err) {
                        console.error("Error sending confirmation email:", err);
                        res.status(500).json({ message: err.message });
                     }
                  }
               );
            } else {
               console.error("No data found in Oracle for TRXNO:", TT_TRXNO);
               res.status(404).json({
                  message: "No data found in Oracle for TRXNO",
               });
            }
         } else {
            // Jika ID transaksi tidak ditemukan dalam database Oracle
            console.error("Transaction ID not found in Oracle database.");
            res.status(404).json({
               message: "Transaction ID not found in Oracle database",
            });
         }
      } catch (err) {
         console.error("Error checking transaction ID in Oracle:", err);
         res.status(500).json({
            message: "Error checking transaction ID in Oracle",
         });
      } finally {
         if (connection) {
            try {
               await connection.close();
            } catch (err) {
               console.error(err);
            }
         }
      }
   }
);

// Endpoint untuk melakukan konfirmasi email berdasarkan TRXNO
app.get("/api/confirm-email/:trxno", async (req, res) => {
   const { trxno } = req.params;
   try {
      // Ambil email dari database berdasarkan TRXNO
      const emailQuery = "SELECT TT_EMAIL FROM trx_tiket WHERE TT_TRXNO = ?";
      db.query(emailQuery, [trxno], async (err, results) => {
         if (err) {
            console.error("Error retrieving email from database:", err);
            res.status(500).json({
               message: "Error retrieving email from database",
            });
         } else {
            if (results.length > 0) {
               const email = results[0].TT_EMAIL;
               // Tandai email sebagai terkonfirmasi di database
               await markEmailAsConfirmed(email);
               // Ambil TRXNO dari database berdasarkan alamat email yang dikonfirmasi
               const TRXNO = trxno;
               // Ambil data dari Oracle berdasarkan TRXNO dan kirim email dengan file CSV terlampir
               await fetchDataFromOracleAndSendEmail(TRXNO, email);
               // Perbarui status menjadi "Open" setelah email dikonfirmasi dan file CSV dikirim
               const updateStatusQuery =
                  "UPDATE trx_tiket SET TT_STATUS = 'O', TT_UPDATE_USER = 'CUSTOMER' WHERE TT_TRXNO = ?";
               db.query(updateStatusQuery, [TRXNO], (err, result) => {
                  if (err) {
                     console.error("Error updating status in database:", err);
                  } else {
                     console.log("Status updated to Open.");
                  }
               });
               res.redirect("http://localhost:5173/konfirmasi");
               // res.status(200).json({ message: "Email confirmed successfully. CSV file sent." });
            } else {
               console.error("No email found for the specified TRXNO:", trxno);
               res.status(404).json({
                  message: "No email found for the specified TRXNO",
               });
            }
         }
      });
   } catch (err) {
      console.error("Error confirming email and sending CSV file:", err);
      res.status(500).json({ message: err.message });
   }
});

// Fungsi untuk mengirim email konfirmasi
async function sendConfirmationEmail(
   email,
   TT_NAMA,
   TRXNO,
   TT_NOHP,
   TT_NPWP,
   TT_NAMA_PT,
   TT_ALAMAT_PT
) {
   try {
      const transporter = nodemailer.createTransport({
         service: "SMTP", // e.g., 'Gmail' or 'SMTP'
         auth: {
            user: "no_reply",
            pass: "vPCnqiNnaA1",
         },
         host: "mail.trid-corp.net",
         port: 587,
         tls: {
            rejectUnauthorized: false,
         },
         agent: new https.Agent({
            rejectUnauthorized: false,
         }),
      });

      const confirmationLink = `http://localhost:3001/api/confirm-email/${TRXNO}`;
      const mailOptions = {
         from: "no_reply@transretail.co.id",
         to: email,
         subject: "Konfirmasi Email",
         html: `<p>Dear ${TT_NAMA},</p>

            <p>Anda telah mengisi form pengajuan permintaan faktur pajak dengan data sebagai berikut:</p>
            
            <table border='0'>
              <tr><td><strong>Nama</strong></td><td>:</td><td>${TT_NAMA}</td></tr>
              <tr><td><strong>ID Transaksi</strong></td><td>:</td><td>${TRXNO}</td></tr>
              <tr><td><strong>Email</strong></td><td>:</td><td>${email}</td></tr>
              <tr><td><strong>No. HP</strong></td><td>:</td><td>${TT_NOHP}</td></tr>
              <tr><td><strong>NPWP</strong></td><td>:</td><td>${TT_NPWP}</td></tr>
              <tr><td><strong>Nama PT</strong></td><td>:</td><td>${TT_NAMA_PT}</td></tr>
              <tr><td><strong>Alamat PT</strong></td><td>:</td><td>${TT_ALAMAT_PT}</td></tr>
            </table>
            
            <p>Untuk bisa kami proses selanjutnya, silakan klik URL berikut untuk mengkonfirmasi permintaan Anda:</p>
            
            <p><a href="${confirmationLink}">${confirmationLink}</a></p>
            
            <p>Status permintaan akan kami kirimkan secara periodik melalui email.</p>
            
            <p>Terima kasih,</p>
            
            <p>Transmart</p>                     
            `,
      };

      await transporter.sendMail(mailOptions);
      console.log("Confirmation email sent successfully.");
   } catch (err) {
      throw err;
   }
}

// Fungsi untuk menandai email sebagai terkonfirmasi di database
async function markEmailAsConfirmed(email) {
   // Anda dapat menambahkan logika di sini untuk menandai email sebagai terkonfirmasi dalam database
   console.log(`ID Transaksi ${email} confirmed.`);
}

// Fungsi untuk mengambil data dari Oracle berdasarkan TRXNO dan langsung mengirim email dengan file CSV terlampir
async function fetchDataFromOracleAndSendEmail(TRXNO, TT_EMAIL) {
   let connection;
   try {
      // Membuat koneksi ke Oracle
      connection = await oracledb.getConnection(oracleConfig);

      // Query untuk memeriksa apakah ID transaksi ada dalam database Oracle
      const checkTransactionQuery = `SELECT * FROM POS_TRANSACTION pt WHERE pt.ID = :TRXNO`;
      const checkTransactionResult = await connection.execute(
         checkTransactionQuery,
         { TRXNO }
      );

      // Jika tidak ada hasil, berhenti dan tidak kirim email
      if (checkTransactionResult.rows.length === 0) {
         console.log(
            "Transaction ID not found in Oracle database. Skipping confirmation email."
         );
         return;
      }

      // Jika ada hasil, lanjutkan dengan mengambil data dan mengirim email
      // Menjalankan query dan mengambil data
      const query = `
    SELECT '1','FK','KD_JENIS_TRANSAKSI','FG_PENGGANTI','NOMOR_FAKTUR','MASA_PAJAK','TAHUN_PAJAK','TANGGAL_FAKTUR','NPWP','NAMA','ALAMAT_LENGKAP','JUMLAH_DPP','JUMLAH_PPN','JUMLAH_PPNBM',
'ID_KETERANGAN_TAMBAHAN','FG_UANG_MUKA','UANG_MUKA_DPP','UANG_MUKA_PPN','UANG_MUKA_PPNBM','REFERENSI'
from dual
union
select
'2','LT','NPWP','NAMA','JALAN','BLOK','NOMOR','RT','RW','KECAMATAN','KELURAHAN','KABUPATEN','PROPINSI',
'KODE_POS','NOMOR_TELEPON','','','','','' from dual
union
select
'3','OF','KODE_OBJEK','NAMA','HARGA_SATUAN','JUMLAH_BARANG','HARGA_TOTAL','DISKON','DPP','PPN','TARIF_PPNBM','PPNBM',
'','','','','','','','' from dual
union
select
NOMOR||tr NOMOR,FK,N01,N02,SERINO,to_char(to_date(tgl, 'yyyymmdd'),'mm'),to_char(to_date(tgl, 'yyyymmdd'),'yyyy'),to_char(to_date(tgl, 'yyyymmdd'),'DD/MM/YYYY'),
NPWPNO,NPWPNAME,NPWPADDR,trim(to_char(dpp,'999999999999999999')),trim(to_char(vat,'999999999999999999')),'0','','0','0','0','0',tr
from (
Select '4' as nomor ,'FK' AS FK,'01' as N01,'0' AS N02,'' AS
SERINO
from dual) t
LEFT JOIN
(select TR AS tr,to_char(TGL,'yyyymmdd') AS tgl,round(sum(dpp),0)
DPP,round(sum(vat),0) VAT,'0' n1,'' n2,'0' n3,'0'n4,'0'n5,'0'n6, 
(case when '[NPWPNO]' != '-' then '[NPWPNO]' else NPWPNO end) as NPWPNO, 
(case when '[NPWPADDR]' != '-' then '[NPWPADDR]' else NPWPADDR end) as NPWPADDR,
(case when '[NPWPNAME]' != '-' then '[NPWPNAME]' else (case when trim(NPWPNAME) in ('PRIVATE USE', 'NON MEMBER') then '' else trim(NPWPNAME) end ) end) NPWPNAME from(
Select pos_txn_id as TR,t.sales_date as
TGL,'OF',tx.EAN13CODE,tx.SHORT_DESC,trim(to_char(round(price_unit-(price_unit)/(1+(1/.1)),0),'999999999999999999'))
harga_satuan,trim(to_char(case when  is_voided='Y' then (-1)*QUANTITY else
QUANTITY end,'9999')),
trim(to_char(case when  is_voided='Y' then
(-1)*round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-(PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
else
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-(PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end,'999999999999999999'))  harga_total,
trim(to_char(case when  is_voided='Y' then
(-1)*round((DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-(DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
else
round((DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-(DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end ,'999999999999999999')) discount,
trim(to_char(case when  is_voided='Y' then
(-1)*((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0))
else
(PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end ,'999999999999999999'))
 DPP,
trim(to_char(0.1*(case when  is_voided='Y' then
(-1)*((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0))
else
(PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end),'999999999999999999'))  VAT,'0','','0','0','0','0', 
nvl(c.NPWP_ADDRESS, '') NPWPADDR, nvl(nvl(c.NPWP_NAME, c.company_name), '') NPWPNAME, 
nvl( (case when c.NPWP_ID like '%00000000000000' then '' else c.NPWP_ID  end), '') NPWPNO
from pos_tx_item tx left join product p on tx.PRODUCT_ID = p.plu_id  
join pos_transaction t on tx.pos_txn_id = t.id
left join crm_member c on t.customer_id = c.account_id
where pos_txn_id =:TRXNO and tx.IS_TAX_INCLUSIVE='Y' 
)a group by TR,to_char(TGL,'yyyymmdd'), NPWPNO,NPWPNAME,NPWPADDR)b on t.nomor like '4%'
union all
Select '4'||tx.pos_txn_id ||tx.id as
key,'OF',tx.EAN13CODE,tx.SHORT_DESC,trim(to_char(round(price_unit-(price_unit)/(1+(1/.1)),0),'999999999999999999'))
harga_satuan,trim(to_char(case when  is_voided='Y' then (-1)*QUANTITY else
QUANTITY end,'9999')),
trim(to_char(case when  is_voided='Y' then
(-1)*round((PRICE_SUBTOTAL)-(PRICE_SUBTOTAL)/(1+(1/.1)),0)
else round((PRICE_SUBTOTAL)-(PRICE_SUBTOTAL)/(1+(1/.1)),0)
end,'999999999999999999'))  harga_total,
trim(to_char(case when  is_voided='Y' then
(-1)*round((DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-(DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),2)
else
round((DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-(DISCOUNT_AMOUNT+MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end ,'999999999999999999')) discount,trim(to_char(case when  is_voided='Y' then
(-1)*((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0))
else
(PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end ,'999999999999999999'))
 DPP,
trim(to_char(0.1*(case when  is_voided='Y' then
(-1)*((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0))
else
(PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)-
round((PRICE_SUBTOTAL-DISCOUNT_AMOUNT-MEMBER_DISCOUNT_AMOUNT-DISC_BTN_AMOUNT-second_layer_discount_amount)/(1+(1/.1)),0)
end),'999999999999999999'))  VAT,'0','0','','','','','','','',''
from pos_tx_item tx left join product p on tx.PRODUCT_ID = p.plu_id  
join pos_transaction t on tx.pos_txn_id = t.id
where pos_txn_id =:TRXNO and tx.IS_TAX_INCLUSIVE='Y'
order by 1
  `;

      const binds = { TRXNO };
      const result = await connection.execute(query, binds);

      // Menulis data ke file CSV
      const filePath = `${TRXNO}.csv`;
      await writeToCSV(result.rows, filePath);

      // Kirim email dengan file CSV terlampir
      await sendEmail(TRXNO, filePath);
   } catch (err) {
      throw err;
   } finally {
      if (connection) {
         try {
            await connection.close();
         } catch (err) {
            console.error(err);
         }
      }
   }
}

// Fungsi untuk menulis data ke file CSV
function writeToCSV(data, filePath) {
   return new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(
         path.join(__dirname, "attachment", filePath)
      ); // Simpan file CSV dalam folder 'attachment'
      const csvStream = csv.format({ headers: true });
      csvStream.pipe(ws);
      data.forEach((row) => {
         csvStream.write(row);
      });
      csvStream.end();
      ws.on("finish", () => {
         console.log("Write to CSV completed.");
         resolve();
      });
      ws.on("error", (err) => {
         console.error("Error writing to CSV:", err);
         reject(err);
      });
   });
}

// Fungsi untuk mengirim email dengan file CSV terlampir
async function sendEmail(TRXNO, filePath) {
   try {
      const transporter = nodemailer.createTransport({
         service: "SMTP", // e.g., 'Gmail' or 'SMTP'
         auth: {
            user: "no_reply",
            pass: "vPCnqiNnaA1",
         },
         host: "mail.trid-corp.net",
         port: 587,
         tls: {
            rejectUnauthorized: false,
         },
         agent: new https.Agent({
            rejectUnauthorized: false,
         }),
      });

      const attachmentFilePath = path.join(__dirname, "attachment", filePath); // Construct the attachment file path

      // Query untuk mengambil data customer dari database berdasarkan email
      const customerQuery =
         "SELECT TT_NAMA, TT_TRXNO, TT_EMAIL, TT_NOHP, TT_NPWP, TT_NAMA_PT, TT_ALAMAT_PT, (SELECT mp_value FROM mst_parameters WHERE mp_config = 'EMAIL_RECEIVER') AS EMAIL_RECEIVER FROM trx_tiket WHERE TT_TRXNO = ?";
      db.query(customerQuery, [TRXNO], async (err, results) => {
         if (err) {
            console.error("Error retrieving customer data from database:", err);
            throw err;
         } else {
            const customerData = results[results.length - 1]; // Ambil data customer pertama dari hasil query
            const {
               TT_NAMA,
               TT_TRXNO,
               TT_EMAIL,
               TT_NOHP,
               TT_NPWP,
               TT_NAMA_PT,
               TT_ALAMAT_PT,
               mp_value,
            } = customerData;

            const mailOptions = {
               from: "no_reply@transretail.co.id",
               to: mp_value,
               subject: "Request Faktur Pajak",
               html: `
        <p>Dear Tax Team,</p>
        <p>Berikut adalah data permintaan faktur pajak dari salah satu pelanggan:</p>
        <table border="0">
            <tr>
                <td>Nama</td>
                <td>:</td>
                <td>${TT_NAMA}</td>
            </tr>
            <tr>
                <td>ID Transaksi</td>
                <td>:</td>
                <td>${TT_TRXNO}</td>
            </tr>
            <tr>
                <td>Email</td>
                <td>:</td>
                <td>${TT_EMAIL}</td>
            </tr>
            <tr>
                <td>No. HP</td>
                <td>:</td>
                <td>${TT_NOHP}</td>
            </tr>
            <tr>
                <td>NPWP</td>
                <td>:</td>
                <td>${TT_NPWP}</td>
            </tr>
            <tr>
                <td>Nama PT</td>
                <td>:</td>
                <td>${TT_NAMA_PT}</td>
            </tr>
            <tr>
                <td>Alamat PT</td>
                <td>:</td>
                <td>${TT_ALAMAT_PT}</td>
            </tr>
        </table>
        <p>Melalui email ini, sudah dilampirkan file CSV untuk proses pembuatan faktur pajak (lihat attachment).</p>
        <p>Untuk memperbarui status permintaan, silakan login ke aplikasi dan update status permintaan tersebut.</p>
        <p>Terima kasih,</p>
        <p>Transmart</p>
    `,
               attachments: [
                  {
                     filename: path.basename(filePath),
                     path: attachmentFilePath,
                  },
               ], // Gunakan path lengkap file CSV
            };

            await transporter.sendMail(mailOptions);
            console.log("Email sent successfully.");
         }
      });
   } catch (err) {
      throw err;
   }
}

app.get("/api/track-status/:trxno", async (req, res) => {
   const { trxno } = req.params;
   try {
      // Query untuk mengambil semua entri berdasarkan TRXNO
      // const query = "SELECT * FROM trx_tiket_history WHERE TTH_TRXNO = ?";
      const query =
         "SELECT tth.*, ms.*, DATE_FORMAT(tth.TTH_UPDATE_DATE, '%Y-%m-%d %H:%i:%s') AS formatted_update_date FROM trx_tiket_history tth JOIN mst_status ms ON ms.ms_code = tth.TTH_STATUS WHERE TTH_TRXNO = ?";
      db.query(query, [trxno], (err, results) => {
         if (err) {
            console.error("Error retrieving data from database:", err);
            res.status(500).json({
               message: "Error retrieving data from database",
            });
         } else {
            if (results.length > 0) {
               res.status(200).json(results);
            } else {
               console.error("No data found for the specified TRXNO:", trxno);
               res.status(404).json({
                  message: "No data found for the specified TRXNO",
               });
            }
         }
      });
   } catch (err) {
      console.error("Error retrieving data:", err);
      res.status(500).json({ message: err.message });
   }
});

// Endpoint untuk mendapatkan detail customer berdasarkan TRXNO
app.get("/api/customer-detail/:trxno", async (req, res) => {
   const { trxno } = req.params;
   try {
      // Query untuk mengambil detail customer dari MySQL
      const query =
         "SELECT TT_NAMA, TT_TRXNO, TT_EMAIL, TT_NOHP, TT_NPWP, TT_NAMA_PT, TT_ALAMAT_PT FROM trx_tiket WHERE TT_TRXNO = ?";
      db.query(query, [trxno], (err, results) => {
         if (err) {
            console.error(
               "Error retrieving customer detail from database:",
               err
            );
            res.status(500).json({
               message: "Error retrieving customer detail from database",
            });
         } else {
            if (results.length > 0) {
               res.status(200).json(results[0]); // Mengirimkan data customer sebagai JSON response
            } else {
               console.error(
                  "No customer detail found for the specified TRXNO:",
                  trxno
               );
               res.status(404).json({
                  message: "No customer detail found for the specified TRXNO",
               });
            }
         }
      });
   } catch (err) {
      console.error("Error retrieving customer detail:", err);
      res.status(500).json({ message: err.message });
   }
});

app.get("/api/pos-detail/:trxno", async (req, res) => {
   const { trxno } = req.params;
   let connection;
   try {
      connection = await oracledb.getConnection(oracleConfig);

      const query = `
      SELECT pt.id, TO_CHAR(pt.SALES_DATE,'DD MON YYYY'), s2.NAME , TOTAL_AMOUNT_PAID 
      FROM POS_TRANSACTION pt 
      LEFT JOIN STORE s2 ON s2.STORE_ID=pt.STORE_ID 
      WHERE pt.id=:TRXNO`;
      const result = await connection.execute(query, { TRXNO: trxno }); // ubah trxno menjadi TRXNO sesuai dengan placeholder dalam query

      if (result.rows.length > 0) {
         const posDetail = {
            id: result.rows[0][0],
            sales_date: result.rows[0][1],
            store_name: result.rows[0][2],
            total_amount_paid: result.rows[0][3],
         };
         res.status(200).json(posDetail);
      } else {
         console.error("No POS detail found for the specified TRXNO:", trxno);
         res.status(404).json({
            message: "No POS detail found for the specified TRXNO",
         });
      }
   } catch (err) {
      console.error("Error retrieving POS detail:", err);
      res.status(500).json({ message: err.message });
   } finally {
      if (connection) {
         try {
            await connection.close();
         } catch (err) {
            console.error("Error closing connection:", err);
         }
      }
   }
});

// Endpoint untuk mendapatkan semua transaksi
app.get("/api/trx_tiket", (req, res) => {
   const sql = `
   SELECT 
        tt.*, 
        ms.*, 
        DATE_FORMAT(tt.TT_INSERT_DATE, '%Y-%m-%d') AS TT_INSERT_DATE_FORMATTED,
        CASE 
            WHEN tt.TT_STATUS = 'C' THEN DATEDIFF(tt.TT_UPDATE_DATE, tt.TT_INSERT_DATE) 
            ELSE DATEDIFF(SYSDATE(), tt.TT_UPDATE_DATE) 
        END AS duration
    FROM 
        trx_tiket tt 
    JOIN 
        mst_status ms ON ms.ms_code = tt.TT_STATUS;
   `;
   //    const sql = `
   //     SELECT *,
   //         DATE_FORMAT(TT_INSERT_DATE, '%Y-%d-%m') AS TT_INSERT_DATE_FORMATTED,
   //         IF(TT_INSERT_DATE = CURRENT_DATE(), CAST(0 AS CHAR), DATEDIFF(CURRENT_DATE(), TT_INSERT_DATE)) AS Durasi
   //     FROM trx_tiket
   // `;

   db.query(sql, (err, result) => {
      if (err) {
         console.error("Error fetching transactions:", err);
         res.status(500).json({ error: "Internal Server Error" });
      } else {
         const transactions = result.map((row) => {
            return {
               TT_TRXNO: row.TT_TRXNO,
               TT_NAMA: row.TT_NAMA,
               TT_EMAIL: row.TT_EMAIL,
               TT_STATUS: row.TT_STATUS,
               TT_STORE: row.TT_STORE,
               TT_SALES_DATE: row.TT_SALES_DATE,
               TT_TOTAL_AMOUNT_PAID: row.TT_TOTAL_AMOUNT_PAID,
               TT_NOHP: row.TT_NOHP,
               TT_NPWP: row.TT_NPWP,
               TT_REMARKS: row.TT_REMARKS,
               TT_NAMA_PT: row.TT_NAMA_PT,
               TT_ALAMAT_PT: row.TT_ALAMAT_PT,
               TT_INSERT_DATE: row.TT_INSERT_DATE,
               TT_INSERT_DATE_FORMATTED: row.TT_INSERT_DATE_FORMATTED,
               Durasi: row.duration,
               ms_name: row.ms_name,
               // Jika ada kolom TT_REMARKS, tambahkan di sini
            };
         });
         res.status(200).json(transactions);
      }
   });
});

app.get("/api/trx_tiket/:trxId", (req, res) => {
   const trxId = req.params.trxId;
   const sql =
      "SELECT tt.*, ms.* FROM trx_tiket tt JOIN mst_status ms ON ms.ms_code = tt.TT_STATUS WHERE TT_TRXNO = ?";
   db.query(sql, [trxId], (err, result) => {
      if (err) {
         console.error("Error fetching transaction:", err);
         res.status(500).json({ error: "Internal Server Error" });
      } else {
         if (result.length === 0) {
            res.status(404).json({ error: "Transaction not found" });
         } else {
            const transaction = result[0];
            // Mengubah TT_TOTAL_AMOUNT_PAID menjadi float dengan 2 digit desimal
            transaction.TT_TOTAL_AMOUNT_PAID = parseFloat(
               transaction.TT_TOTAL_AMOUNT_PAID
            ).toFixed(2);

            // Menambahkan URL gambar NPWP dan struk ke objek respons
            transaction.npwpUrl = `/uploads/npwp/${trxId}_npwp.jpeg`;
            transaction.strukUrl = `/uploads/struk/${trxId}_struk.jpeg`;

            res.status(200).json(transaction);
         }
      }
   });
});

app.get("/api/trx_tiket/:trxId/foto_npwp", (req, res) => {
   const { trxId } = req.params;
   // Misalnya, Anda memiliki path file yang disimpan di server
   const filePath = path.join(
      __dirname,
      "uploads",
      "npwp",
      `${trxId}_npwp.jpeg`
   );

   // Membaca file sebagai buffer
   fs.readFile(filePath, (err, data) => {
      if (err) {
         console.error("Failed to read file:", err);
         return res.status(500).send("Failed to fetch NPWP photo");
      }

      // Mengirimkan data sebagai blob dengan tipe konten image/jpeg
      res.writeHead(200, {
         "Content-Type": "image/jpeg",
         "Content-Length": data.length,
      });
      res.end(data);
   });
});
app.get("/api/trx_tiket/:trxId/foto_struk", (req, res) => {
   const { trxId } = req.params;
   // Misalnya, Anda memiliki path file yang disimpan di server
   const filePath = path.join(
      __dirname,
      "uploads",
      "struk",
      `${trxId}_struk.jpeg`
   );

   // Membaca file sebagai buffer
   fs.readFile(filePath, (err, data) => {
      if (err) {
         console.error("Failed to read file:", err);
         return res.status(500).send("Failed to fetch NPWP photo");
      }

      // Mengirimkan data sebagai blob dengan tipe konten image/jpeg
      res.writeHead(200, {
         "Content-Type": "image/jpeg",
         "Content-Length": data.length,
      });
      res.end(data);
   });
});

// Endpoint untuk memperbarui status dan remarks transaksi berdasarkan ID transaksi
app.put("/api/trx_tiket/:trxno", async (req, res) => {
   const trxno = req.params.trxno;
   const { TT_STATUS, TT_REMARKS } = req.body;

   // Lakukan validasi data masukan di sini jika diperlukan

   // Lakukan update status dan remarks di database MySQL
   const updateQuery = `
      UPDATE trx_tiket 
      SET TT_STATUS = ?, TT_REMARKS = ? 
      WHERE TT_TRXNO = ?
   `;
   db.query(updateQuery, [TT_STATUS, TT_REMARKS, trxno], (err, result) => {
      if (err) {
         console.error("Error updating transaction:", err);
         res.status(500).json({ message: "Error updating transaction" });
      } else {
         console.log("Transaction updated successfully.");
         res.status(200).json({ message: "Transaction updated successfully." });
      }
   });
});

// Route untuk mengambil file faktur
app.get("/api/trx_tiket/:trxId/file_faktur", (req, res) => {
   try {
      // Dapatkan trxId dari params
      const { trxId } = req.params;

      // Sertakan logika untuk mengambil file faktur dari direktori uploads/faktur
      // Misalnya, jika file faktur disimpan dengan nama {trxId}.pdf
      const fakturPath = path.join(
         __dirname,
         "uploads",
         "faktur",
         `${trxId}_faktur.pdf`
      );

      // Kirim file faktur sebagai respons
      res.sendFile(fakturPath);
   } catch (error) {
      console.error("Failed to send invoice file:", error);
      res.status(500).json({ message: "Internal server error" });
   }
});

app.post("/api/update-status-and-remarks", async (req, res) => {
   const { trxno, status, remarks } = req.body;

   // Periksa apakah status yang dimasukkan valid
   const validStatus = ["O", "C", "P"];
   if (!validStatus.includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
   }

   // Periksa apakah ID transaksi ada dalam database MySQL
   const checkTransactionQuery = `SELECT TT_TRXNO FROM trx_tiket WHERE TT_TRXNO = ?`;
   db.query(checkTransactionQuery, [trxno], async (err, results) => {
      if (err) {
         console.error("Error checking transaction ID in MySQL:", err);
         return res
            .status(500)
            .json({ message: "Error checking transaction ID in MySQL" });
      }
      if (results.length === 0) {
         return res
            .status(404)
            .json({ message: "Transaction ID not found in MySQL database" });
      }

      try {
         // Update status dan remarks dalam database MySQL
         const updateQuery = `
            UPDATE trx_tiket 
            SET TT_STATUS = ?, TT_REMARKS = ? 
            WHERE TT_TRXNO = ?
         `;
         db.query(updateQuery, [status, remarks, trxno], (err, result) => {
            if (err) {
               console.error(
                  "Error updating status and remarks in MySQL:",
                  err
               );
               return res.status(500).json({
                  message: "Error updating status and remarks in MySQL",
               });
            }

            console.log("Status and remarks updated successfully.");
            res.status(200).json({
               message: "Status and remarks updated successfully.",
            });
         });
      } catch (err) {
         console.error("Error updating status and remarks in MySQL:", err);
         res.status(500).json({
            message: "Error updating status and remarks in MySQL",
         });
      }
   });
});

const npwpStorage = multer.diskStorage({
   destination: function (req, file, cb) {
      cb(null, "uploads/npwp");
   },
   filename: function (req, file, cb) {
      const TT_TRXNO = req.body.TT_TRXNO;
      const fileName = `${TT_TRXNO}_npwp.jpg`;
      cb(null, fileName);
   },
});

// Konfigurasi Multer untuk menyimpan file di folder uploads/struk
const strukStorage = multer.diskStorage({
   destination: function (req, file, cb) {
      cb(null, "uploads/struk");
   },
   filename: function (req, file, cb) {
      const TT_TRXNO = req.body.TT_TRXNO;
      const fileName = `${TT_TRXNO}_struk.jpg`;
      cb(null, fileName);
   },
});

// Inisialisasi upload handler menggunakan Multer
const uploadNPWP = multer({ storage: npwpStorage });
const uploadStruk = multer({ storage: strukStorage });

app.post("/api/upload-npwp", uploadNPWP.single("foto"), async (req, res) => {
   req.trxno = req.body.TT_TRXNO;
   console.log("TT_TRXNO:", req.body.TT_TRXNO);

   try {
      // Proses upload selesai, kirim respons ke klien
      res.status(200).json({ message: "Foto NPWP berhasil diunggah." });
      console.log(req.file);
   } catch (err) {
      console.error("Error uploading NPWP photo:", err);
      res.status(500).json({ message: "Error uploading NPWP photo." });
   }
});

// Endpoint untuk mengunggah foto Struk
app.post("/api/upload-struk", uploadStruk.single("foto"), async (req, res) => {
   try {
      // Proses upload selesai, kirim respons ke klien
      res.status(200).json({ message: "Struk photo uploaded successfully." });
   } catch (err) {
      console.error("Error uploading Struk photo:", err);
      res.status(500).json({ message: "Error uploading Struk photo." });
   }
});

// Konfigurasi penyimpanan file menggunakan multer
const storage = multer.diskStorage({
   destination: function (req, file, cb) {
      cb(null, "uploads/faktur");
   },
   filename: function (req, file, cb) {
      const TT_TRXNO = req.body.TT_TRXNO;
      const fileName = `${TT_TRXNO}_faktur.pdf`;
      cb(null, fileName);
   },
});

// Inisialisasi middleware multer
const upload = multer({ storage: storage });

// Handle pengunggahan file
app.post("/api/upload", upload.single("file"), async (req, res) => {
   try {
      const TT_TRXNO = req.body.TT_TRXNO;
      const transactionInfo = await getTransactionInfo(TT_TRXNO);

      const TT_NAMA = transactionInfo.TT_NAMA;
      const TT_INSERT_DATE = new Date(transactionInfo.TT_INSERT_DATE);
      const formattedDate = `${TT_INSERT_DATE.getDate()}-${
         TT_INSERT_DATE.getMonth() + 1
      }-${TT_INSERT_DATE.getFullYear()}`;

      const TT_EMAIL = transactionInfo.TT_EMAIL;
      const fileName = req.file.filename;
      const filePath = path.join(__dirname, "uploads/faktur", fileName);

      // Kirim email dengan file terlampir ke alamat email yang sesuai (TT_EMAIL)
      const transporter = nodemailer.createTransport({
         // Konfigurasi transporter email
         service: "SMTP", // e.g., 'Gmail' or 'SMTP'
         auth: {
            user: "no_reply",
            pass: "vPCnqiNnaA1",
         },
         host: "mail.trid-corp.net",
         port: 587,
         tls: {
            rejectUnauthorized: false,
         },
         agent: new https.Agent({
            rejectUnauthorized: false,
         }),
      });

      const mailOptions = {
         from: "no_reply@transretail.co.id",
         to: TT_EMAIL,
         subject: "File Faktur",
         html: `<p>Dear ${TT_NAMA},</p>
         <p>Bersama email ini Kami lampirkan Faktur Pajak yang anda request pada tanggal ${formattedDate}.</p>
         <p>Terima kasih</p>
         <p>Salam</p>
         <p>Tax Division</p>
         <p>PT. Trans Retail Indonesia</p>`,
         attachments: [
            {
               filename: fileName,
               path: filePath,
            },
         ],
      };

      // Kirim email
      await transporter.sendMail(mailOptions);
      console.log("Email sent successfully.");
      res.status(200).send("File uploaded and email sent successfully");
   } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).send("Error sending email");
   }
});

// Fungsi untuk mengambil informasi transaksi dari database berdasarkan TT_TRXNO
async function getTransactionInfo(TT_TRXNO) {
   return new Promise((resolve, reject) => {
      // Ganti dengan kueri sesuai dengan skema basis data Anda
      const sql = "SELECT * FROM trx_tiket WHERE TT_TRXNO = ?";
      db.query(sql, [TT_TRXNO], (err, result) => {
         if (err) {
            reject(err);
         } else {
            resolve(result[0] || null);
         }
      });
   });
}

app.post("api/login", (req, res) => {
   let data = new FormData();
   data.append("EMPID", "xxxxxxxxxxx");
   data.append("PASS", "12345678");
   data.append("DATA", "AUTH");
   data.append("KEY", "FNylcvX7HKbOq7nW");

   let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://hcm.transretail.co.id/services/paos.php",
      headers: {
         ...data.getHeaders(),
      },
      data: data,
   };

   axios
      .request(config)
      .then((response) => {
         console.log(JSON.stringify(response.data));
      })
      .catch((error) => {
         console.log(error);
      });
});

app.get("/api/status", (req, res) => {
   const queries = [
      "SELECT COUNT(*) as total_transaksi FROM trx_tiket",
      'SELECT COUNT(*) as total_faktur_waiting FROM trx_tiket WHERE TT_STATUS = "W"',
      'SELECT COUNT(*) as total_faktur_open FROM trx_tiket WHERE TT_STATUS = "O"',
      'SELECT COUNT(*) as total_faktur_process FROM trx_tiket WHERE TT_STATUS = "P"',
      'SELECT COUNT(*) as total_faktur_closed FROM trx_tiket WHERE TT_STATUS = "C"',
   ];

   let results = [];

   queries.forEach((query) => {
      db.query(query, (err, result) => {
         if (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to fetch data" });
         } else {
            results.push(result[0]);
            if (results.length === queries.length) {
               const data = {
                  total_transaksi: results[0].total_transaksi,
                  total_faktur_waiting: results[1].total_faktur_waiting,
                  total_faktur_open: results[2].total_faktur_open,
                  total_faktur_process: results[3].total_faktur_process,
                  total_faktur_closed: results[4].total_faktur_closed,
               };
               res.json(data);
            }
         }
      });
   });
});

// Endpoint untuk mendapatkan grup pengguna
app.post("/api/checkgroup", (req, res) => {
   const { username } = req.body;

   const groupQuery = `
     SELECT mg_id, mg_name 
     FROM mst_group_member mgm
     JOIN mst_group mg ON mgm.mgm_mg_id = mg.mg_id 
     WHERE mgm.mgm_user_id = ?
   `;

   db.query(groupQuery, [username], (err, results) => {
      if (err) {
         res.status(500).json({ error: "Database query error" });
         return;
      }
      if (results.length > 0) {
         const groupName = results[0].mg_id;
         res.json({ groupName });
      } else {
         res.status(401).json({ error: "User group not found" });
      }
   });
});

// Konfigurasi SMTP untuk email
const transporter = nodemailer.createTransport({
   service: "SMTP", // e.g., 'Gmail' or 'SMTP'
   auth: {
      user: "no_reply",
      pass: "vPCnqiNnaA1",
   },
   host: "mail.trid-corp.net",
   port: 587,
   tls: {
      rejectUnauthorized: false,
   },
});

// Mengatur jadwal pengiriman email menggunakan node-schedule
const j = schedule.scheduleJob("00 09 * * *", function () {
   // Query untuk mendapatkan alamat email penerima
   const queryEmailReceiver = `
     SELECT 
        mp_config,
        mp_value
     FROM mst_parameters
     WHERE mp_config IN ('EMAIL_RECEIVER', 'EMAIL_RECEIVER_SPV')`;

   // Mengirim email berdasarkan hasil query untuk alamat email penerima
   db.query(queryEmailReceiver, function (err, emailResults) {
      if (err) throw err;

      // Jika ada hasil dari query alamat email, kirim email
      if (emailResults.length > 0) {
         const emailReceiver = emailResults.find(
            (result) => result.mp_config === "EMAIL_RECEIVER"
         ).mp_value;
         const emailSPV = emailResults.find(
            (result) => result.mp_config === "EMAIL_RECEIVER_SPV"
         ).mp_value;

         // Query untuk mendapatkan data dari database (Query 1)
         const query1 = `
         select trxno, salesDate, store, total, fullName, noHp, npwp, corporate, status, duration
         from
         (select TT_TRXNO trxno, TT_SALES_DATE salesDate, TT_STORE store, TT_TOTAL_AMOUNT_PAID total, tt_nama fullName, TT_NOHP noHp, 
         TT_NPWP npwp, TT_NAMA_PT corporate, ms_name status, 
         case when TT_STATUS='C' then datediff(TT_UPDATE_DATE, TT_INSERT_DATE) else datediff(sysdate(), TT_UPDATE_DATE) end  duration
         from trx_tiket
         join mst_status ms on ms_code=tt_status
         WHERE TT_STATUS='O') T
         join mst_parameters mp on mp.mp_config ='DURATION_NOTIF_OPEN'
         where 1=1 and duration >= mp.mp_value`;

         // Mengirim email berdasarkan hasil dari query1
         db.query(query1, function (err, results1) {
            if (err) throw err;

            // Jika ada hasil dari query1, kirim email
            if (results1.length > 0) {
               const mailOptions1 = {
                  from: "no_reply@transretail.co.id",
                  to: `${emailReceiver},${emailSPV}`,
                  subject:
                     "Reminder: Tiket Status OPEN Telah Melewati Batas Waktu 3 Hari ",
                  html: `
               <p>Dear HO Tax Team,</p>
               <p>Email reminder ini otomatis terkirim karena ada tiket status OPEN sudah lebih 3 hari yang perlu segera ditindaklanjuti ke customer.</p>
               <h3>Berikut daftar tiketnya:</h3>
               <table border="1" cellspacing="0" cellpadding="5">
                 <tr>
                   <th>ID Transaksi</th>
                   <th>Tanggal Penjualan</th>
                   <th>Store</th>
                   <th>Nama</th>
                   <th>No HP</th>
                   <th>Status</th>
                   <th>Durasi</th>
                 </tr>
                 ${results1
                    .map(
                       (result) => `
                   <tr>
                     <td>${result.trxno}</td>
                     <td>${result.salesDate}</td>
                     <td>${result.store}</td>
                     <td>${result.fullName}</td>
                     <td>${result.noHp}</td>
                     <td>${result.status}</td>
                     <td>${result.duration}</td>
                   </tr>
                 `
                    )
                    .join("")}
               </table>
               <p>Untuk lebih detailnya silahkan mengakses laman https://fakturpajak.transmart.co.id/admin untuk mengupdate statusnya.</p>
               <p>Salam</p>
             `,
               };

               transporter.sendMail(mailOptions1, function (error, info) {
                  if (error) {
                     console.log(error);
                  } else {
                     console.log(
                        "Email reminder (Status Open) telah terkirim: " +
                           info.response
                     );
                  }
               });
            } else {
               console.log("Tidak ada data untuk dikirim dari query1");
            }
         });

         // Query untuk mendapatkan data dari database (Query 2)
         const query2 = `
         select trxno, salesDate, store, total, fullName, noHp, npwp, corporate, status, duration
         from
         (select TT_TRXNO trxno, TT_SALES_DATE salesDate, TT_STORE store, TT_TOTAL_AMOUNT_PAID total, tt_nama fullName, TT_NOHP noHp, 
         TT_NPWP npwp, TT_NAMA_PT corporate, ms_name status, 
         case when TT_STATUS='C' then datediff(TT_UPDATE_DATE, TT_INSERT_DATE) else datediff(sysdate(), TT_UPDATE_DATE) end  duration
         from trx_tiket
         join mst_status ms on ms_code=tt_status
         WHERE TT_STATUS='P') T
         join mst_parameters mp on mp.mp_config ='DURATION_NOTIF_PROGRESS'
         where 1=1 and duration >= mp.mp_value`;

         // Mengirim email berdasarkan hasil dari query2
         db.query(query2, function (err, results2) {
            if (err) throw err;

            // Jika ada hasil dari query2, kirim email
            if (results2.length > 0) {
               const mailOptions2 = {
                  from: "no_reply@transretail.co.id",
                  to: `${emailReceiver},${emailSPV}`,
                  subject:
                     "Reminder: Tiket Status ON PROGRESS Telah Melewati Batas Waktu 10 Hari ",
                  html: `
               <p>Dear HO Tax Team,</p>
               <p>Email reminder ini otomatis terkirim karena ada tiket status ON PROGRESS sudah lebih dari 10 hari yang perlu segera ditindaklanjuti ke customer.</p>
               <h3>Berikut daftar tiketnya:</h3>
               <table border="1" cellspacing="0" cellpadding="5">
                 <tr>
                   <th>ID Transaksi</th>
                   <th>Tanggal Penjualan</th>
                   <th>Store</th>
                   <th>Nama</th>
                   <th>No HP</th>
                   <th>Status</th>
                   <th>Durasi</th>
                 </tr>
                 ${results2
                    .map(
                       (result) => `
                   <tr>
                     <td>${result.trxno}</td>
                     <td>${result.salesDate}</td>
                     <td>${result.store}</td>
                     <td>${result.fullName}</td>
                     <td>${result.noHp}</td>
                     <td>${result.status}</td>
                     <td>${result.duration}</td>
                   </tr>
                 `
                    )
                    .join("")}
               </table>
               <p>Untuk lebih detailnya silahkan mengakses laman https://fakturpajak.transmart.co.id/admin untuk mengupdate statusnya.</p>
               <p>Salam</p>
             `,
               };
               transporter.sendMail(mailOptions2, function (error, info) {
                  if (error) {
                     console.log(error);
                  } else {
                     console.log(
                        "Email reminder (Status P) telah terkirim: " +
                           info.response
                     );
                  }
               });
            } else {
               console.log("Tidak ada data untuk dikirim dari query2");
            }
         });
      } else {
         console.log("Tidak ada alamat email yang ditemukan dari query");
      }
   });
});

// Tentukan timezone yang tepat
process.env.TZ = "Asia/Jakarta";

app.listen(port, () => {
   console.log(`Server running on port ${port}`);
});
// server.listen(port, () => {
//    console.log(`Server running on port ${port}`);
// });

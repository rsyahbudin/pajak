import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo.png";
import axios from "axios";
import { ToastContainer, toast, Bounce } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Bahasa from "../../components/bahasa";
import imageCompression from 'browser-image-compression';
import ReCAPTCHA from "react-recaptcha-google";

function Homepage() {
   const navigate = useNavigate();
   const [form, setForm] = useState({
      TT_TRXNO: "",
      TT_NAMA: "",
      TT_EMAIL: "",
      TT_NOHP: "",
      TT_NPWP: "",
      TT_NAMA_PT: "",
      TT_ALAMAT_PT: "",
      TT_FOTO_NPWP: null,
      TT_FOTO_TRX: null,
   });
   const [error, setError] = useState("");
   const [fileInputs, setFileInputs] = useState({
      TT_FOTO_NPWP: null,
      TT_FOTO_TRX: null,
   });
   const [isLoading, setIsLoading] = useState(false);
   const [language, setLanguage] = useState("id"); // Default language is Indonesian
   const [captchaVerified, setCaptchaVerified] = useState(false); // Track whether captcha is verified

   const handleChange = (e) => {
      setForm({ ...form, [e.target.name]: e.target.value });
   };

   const handleFileChange = async (e) => {
      const file = e.target.files[0];
      if (file) {
          const fileName = file.name;
          const fileType = file.type;
          const fileExtension = fileName.split('.').pop().toLowerCase();
  
          // Validasi ekstensi file
          if (fileExtension !== 'jpg' && fileExtension !== 'jpeg') {
              console.error("Invalid file format. Please upload JPG or JPEG file.");
              toast.error("Mohon unggah file dengan tipe JPG/JPEG.", {
                  position: "top-right",
                  autoClose: 4000,
                  hideProgressBar: true,
                  closeOnClick: true,
                  pauseOnHover: false,
                  draggable: true,
                  progress: undefined,
                  theme: "colored",
                  transition: Bounce,
              });
              e.target.value = ""; // Kosongkan input file
              return;
          }
  
          const fileSizeBeforeCompression = file.size; // Ukuran file sebelum kompresi
  
          // Kompresi gambar
          const options = {
              maxSizeMB: 2, // Maksimum ukuran hasil kompresi dalam MB
              maxWidthOrHeight: 800, // Maksimum dimensi gambar setelah kompresi
              useWebWorker: true // Menggunakan Web Worker untuk kompresi (opsional)
          };
          try {
              const  compressedFile = await imageCompression(file, options);
              const fileSizeAfterCompression = compressedFile.size; // Ukuran file setelah kompresi
  
              // Mencatat ukuran file sebelum dan sesudah kompresi
              console.log("Ukuran file sebelum kompresi:", fileSizeBeforeCompression);
              console.log("Ukuran file setelah kompresi:", fileSizeAfterCompression);
  
              setFileInputs({ ...fileInputs, [e.target.name]: compressedFile });
          } catch (error) {
              console.error("Error compressing image:", error);
              toast.error("Terjadi kesalahan saat mengompresi gambar.", {
                  position: "top-right",
                  autoClose: 4000,
                  hideProgressBar: true,
                  closeOnClick: true,
                  pauseOnHover: false,
                  draggable: true,
                  progress: undefined,
                  theme: "colored",
                  transition: Bounce,
              });
          }
      }
  };
  

  const handleSubmit = async (e) => {
   e.preventDefault();
   setIsLoading(true); // Mengatur isLoading menjadi true saat proses pengiriman dimulai
   try {
      const isConfirmed = window.confirm(
         "Apakah email sudah benar? Faktur akan dikirim melalui email tersebut."
      );

      if (isConfirmed) {
         const formData = new FormData();
         Object.entries(form).forEach(([key, value]) => {
            formData.append(key, value);
         });

         // Memeriksa apakah ukuran file melebihi batas maksimal
         const maxSize = 2 * 1024 * 1024; // 5MB
         if (
            fileInputs.TT_FOTO_NPWP.size > maxSize ||
            fileInputs.TT_FOTO_TRX.size > maxSize
         ) {
            setError("Ukuran file harus lebih kecil dari 5MB.");
            toast.error("Ukuran file harus lebih kecil dari 5MB.", {
               position: "top-right",
               autoClose: 4000,
               hideProgressBar: true,
               closeOnClick: true,
               pauseOnHover: false,
               draggable: true,
               progress: undefined,
               theme: "colored",
               transition: Bounce,
            });
            setIsLoading(false); // Menghentikan loading spinner jika terjadi kesalahan
            return;
         }

         formData.append("TT_FOTO_NPWP", fileInputs.TT_FOTO_NPWP);
         formData.append("TT_FOTO_TRX", fileInputs.TT_FOTO_TRX);

         const response = await axios.post("http://localhost:3001/api/submit-form", formData);
         // const response = await axios.post("https://fakturpajak.transmart.co.id:3001/api/submit-form", formData);

         console.log("Ukuran file setelah pengiriman:", response.headers["content-length"]);

         toast.success(
            "Email konfirmasi permintaan sudah dikirimkan ke email yang tercantum, harap segera lakukan konfirmasi permintaan Anda",
            {
               position: "top-right",
               autoClose: false,
               hideProgressBar: true,
               closeOnClick: true,
               pauseOnHover: false,
               draggable: true,
               progress: undefined,
               theme: "colored",
               transition: Bounce,
            }
         );
         setForm({
            TT_TRXNO: "",
            TT_NAMA: "",
            TT_EMAIL: "",
            TT_NOHP: "",
            TT_NPWP: "",
            TT_NAMA_PT: "",
            TT_ALAMAT_PT: "",
            TT_FOTO_NPWP: null,
            TT_FOTO_TRX: null,
         });
         resetPhotoInputs(); // Reset input file foto NPWP dan struk
         setError(""); // Reset error state after successful submission
      }
   } catch (error) {
      console.error("Error:", error.message);
      if (error.response && error.response.status === 404) {
         setError("ID Transaksi tidak ditemukan");
         toast.error("ID Transaksi tidak ditemukan", {
            position: "top-right",
            autoClose: 4000,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: false,
            draggable: true,
            progress: undefined,
            theme: "colored",
            transition: Bounce,
         });
      } else if (error.response && error.response.status === 400) {
         setError("ID Transaksi sudah lebih dari 90 hari");
         toast.error("ID Transaksi sudah lebih dari 90 hari", {
            position: "top-right",
            autoClose: 4000,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: false,
            draggable: true,
            progress: undefined,
            theme: "colored",
            transition: Bounce,
         });
      } else if (error.response && error.response.status === 500) {
         setError("Terjadi kesalahan pada server. Mohon coba lagi nanti.");
         toast.error(
            "Terjadi kesalahan pada server. Mohon coba lagi nanti.",
            {
               position: "top-right",
               autoClose: false,
               hideProgressBar: true,
               closeOnClick: true,
               pauseOnHover: false,
               draggable: true,
               progress: undefined,
               theme: "colored",
               transition: Bounce,
            }
         );
      } else {
         setError("ID Transaksi sudah dibuatkan Faktur Pajaknya");
         toast.error("ID Transaksi sudah dibuatkan Faktur Pajaknya", {
            position: "top-right",
            autoClose: false,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: false,
            draggable: true,
            progress: undefined,
            theme: "colored",
            transition: Bounce,
         });
      }
   } finally {
      setIsLoading(false); // Menyembunyikan loading spinner setelah proses pengiriman selesai
   }
};


   // // Jika error koneksi
   // axios.interceptors.response.use(response => {return response;},
   //   error => {
   //     if (!error.response) {
   //       setError("Maaf koneksi sedang bermasalah, tidak bisa membuat request untuk sementara");
   //       toast.error("Maaf koneksi sedang bermasalah, tidak bisa membuat request untuk sementara", {
   //         position: "top-right",
   //         autoClose: false,
   //         hideProgressBar: true,
   //         closeOnClick: true,
   //         pauseOnHover: false,
   //         draggable: true,
   //         progress: undefined,
   //         theme: "colored",
   //         transition: Bounce,
   //       });
   //     }
   //     return Promise.reject(error);
   //   }
   //   )

   const handleStatusRequest = () => {
      navigate("/track");
   };

   const resetPhotoInputs = () => {
      // Mengatur nilai input file foto NPWP dan struk menjadi kosong
      document.getElementById("TT_FOTO_NPWP").value = "";
      document.getElementById("TT_FOTO_TRX").value = "";
   };

   const changeLanguage = (lang) => {
      setLanguage(lang);
      // You can implement language change logic here, if needed
   };

   const verifyCaptcha = (value) => {
      setCaptchaVerified(true);
   };

   return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-">
         <Bahasa onChangeLanguage={changeLanguage} />
         <div className=" p-6 bg-white shadow-md rounded-md">
            <div className="App">
               <header className="mb-6 flex flex-col items-center">
                  <img src={logo} alt="Logo" className="mx-auto h-12 w-auto" />
                  <h1 className="text-2xl font-bold text-center mt-3">
                     {language === "id"
                        ? "Permintaan Faktur Pajak"
                        : "Request Tax Invoice"}
                  </h1>
               </header>
               <form onSubmit={handleSubmit} className="flex flex-wrap">
                  {isLoading && (
                     <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-gray-500 bg-opacity-50 z-50">
                        <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-gray-900"></div>
                     </div>
                  )}
                  <div className="w-full md:w-1/2 pr-4">
                     <legend className="text-lg font-medium text-gray-800 mb-2">
                        {language === "id"
                           ? "Informasi Pribadi"
                           : "Personal Information"}
                     </legend>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_NAMA"
                           className="block text-sm font-medium text-gray-700"
                        >
                           {language === "id" ? "Nama" : "Name"}
                        </label>
                        <input
                           type="text"
                           name="TT_NAMA"
                           id="TT_NAMA"
                           value={form.TT_NAMA}
                           onChange={handleChange}
                           placeholder={language === "id" ? "Nama" : "Name"}
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                        />
                     </div>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_TRXNO"
                           className="block text-sm font-medium text-gray-700"
                        >
                           {language === "id"
                              ? "ID Transaksi"
                              : "Transaction ID"}
                        </label>
                        <input
                           type="text"
                           name="TT_TRXNO"
                           id="TT_TRXNO"
                           value={form.TT_TRXNO}
                           onChange={handleChange}
                           placeholder={
                              language === "id"
                                 ? "ID Transaksi"
                                 : "Transaction ID"
                           }
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                        />
                     </div>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_EMAIL"
                           className="block text-sm font-medium text-gray-700"
                        >
                           Email
                        </label>
                        <input
                           type="email"
                           name="TT_EMAIL"
                           id="TT_EMAIL"
                           value={form.TT_EMAIL}
                           onChange={handleChange}
                           placeholder="Email"
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                        />
                     </div>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_NOHP"
                           className="block text-sm font-medium text-gray-700"
                        >
                           {language === "id"
                              ? "Nomor Telepon"
                              : "Phone Number"}
                        </label>
                        <input
                           type="tel"
                           name="TT_NOHP"
                           id="TT_NOHP"
                           value={form.TT_NOHP}
                           onChange={handleChange}
                           placeholder={
                              language === "id"
                                 ? "Nomor Telepon"
                                 : "Phone Number"
                           }
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                        />
                     </div>
                  </div>
                  <div className="w-full md:w-1/2">
                     <legend className="text-lg font-medium text-gray-800 mb-2">
                        {language === "id"
                           ? "Informasi Perusahaan"
                           : "Company Information"}
                     </legend>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_NPWP"
                           className="block text-sm font-medium text-gray-700"
                        >
                           NPWP
                        </label>
                        <input
                           type="text"
                           name="TT_NPWP"
                           id="TT_NPWP"
                           value={form.TT_NPWP}
                           onChange={handleChange}
                           placeholder="NPWP"
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                           pattern="\d{16}"
                           title="NPWP harus terdiri dari 16 digit angka"
                        />
                     </div>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_NAMA_PT"
                           className="block text-sm font-medium text-gray-700"
                        >
                           {language === "id"
                              ? "Nama Perusahaan"
                              : "Company Name"}
                        </label>
                        <input
                           type="text"
                           name="TT_NAMA_PT"
                           id="TT_NAMA_PT"
                           value={form.TT_NAMA_PT}
                           onChange={handleChange}
                           placeholder={
                              language === "id"
                                 ? "Nama Perusahaan"
                                 : "Company Name"
                           }
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                        />
                     </div>
                     <div className="mb-4">
                        <label
                           htmlFor="TT_ALAMAT_PT"
                           className="block text-sm font-medium text-gray-700"
                        >
                           {language === "id"
                              ? "Alamat Perusahaan"
                              : "Company Address"}
                        </label>
                        <input
                           type="text"
                           name="TT_ALAMAT_PT"
                           id="TT_ALAMAT_PT"
                           value={form.TT_ALAMAT_PT}
                           onChange={handleChange}
                           placeholder={
                              language === "id"
                                 ? "Alamat Perusahaan"
                                 : "Company Address"
                           }
                           className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                           required
                        />
                     </div>

                     <div className="flex flex-col md:flex-row">
                        <div className="mb-4 md:mr-2">
                           <label
                              htmlFor="foto-npwp"
                              className="block text-sm font-medium text-gray-700"
                           >
                              {language === "id" ? "Foto NPWP" : "NPWP Photo"}
                           </label>
                           <input
                              type="file"
                              accept="image/*"
                              name="TT_FOTO_NPWP"
                              id="TT_FOTO_NPWP"
                              onChange={handleFileChange}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                              required
                           />
                        </div>
                        <div className="mb-4 md:ml-2">
                           <label
                              htmlFor="foto-struk"
                              className="block text-sm font-medium text-gray-700"
                           >
                              {language === "id"
                                 ? "Foto Struk"
                                 : "Transaction Receipt Photo"}
                           </label>
                           <input
                              type="file"
                              accept="image/*"
                              name="TT_FOTO_TRX"
                              id="TT_FOTO_TRX"
                              onChange={handleFileChange}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-800 focus:ring focus:ring-indigo-800 focus:ring-opacity-50 p-2 transition duration-200 ease-in-out bg-gray-200 focus:bg-white"
                              required
                           />
                        </div>
                     </div>
                  </div>
                  <div className="w-full flex justify-center">
                     <div>
                        {/* <ReCAPTCHA
                sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                onChange={verifyCaptcha}
              />
             */}
                     </div>
                     <button
                        type="submit"
                        className="bg-primary text-white font-normal py-2 px-4 rounded mr-2 shadow-md transition duration-300 ease-in-out transform hover:shadow-lg"
                     >
                        {language === "id"
                           ? "Request Faktur Pajak"
                           : "Request Tax Invoice"}
                     </button>
                     <button
                        type="button"
                        className="bg-gray-600 hover:bg-gray-800 text-white font-normal py-2 px-4 rounded transition duration-300 ease-in-out transform hover:shadow-lg"
                        onClick={handleStatusRequest}
                     >
                        {language === "id"
                           ? "Cek Status Request"
                           : "Check Request Status"}
                     </button>
                  </div>
               </form>
            </div>
         </div>
         <ToastContainer />
      </div>
   );
}

export default Homepage;

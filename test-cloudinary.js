const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dhwqvfpcw',
  api_key: '872194879679226',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'tu_api_secret_aqui'
});

(async function() {
  try {
    const result = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg', {
      public_id: 'test-shoes',
      folder: 'colbisnes-test'
    });
    console.log('✅ Subida exitosa:', result.secure_url);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();

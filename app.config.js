// app.config.js
import 'dotenv/config';

export default {
  expo: {
    name: 'YouSound',
    slug: 'yousound',
    version: '1.0.0',
    extra: {
      assemblyApiKey: process.env.ASSEMBLY_AI_API_KEY,
    },
  },
};

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`نظام إدارة التوزيع شغال على http://localhost:${PORT}`);
});

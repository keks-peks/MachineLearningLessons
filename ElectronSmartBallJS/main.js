const {app, BrowserWindow} = require('electron')

let win

app.on('ready', function () {
  win = new BrowserWindow({width: 1100, height: 900, resizable: false})
  win.setMenu(null)
  win.loadURL('file://' + __dirname + '/main.html')
  // win.webContents.openDevTools()
})
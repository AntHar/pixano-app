/**
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2019)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
*/

const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const serveStatic = require('serve-static');
const path = require('path');
const cookieParser = require('cookie-parser')
const { initLevel } = require(__dirname + '/config/db');
const os = require( 'os' );
const interfaces = os.networkInterfaces();
const chalk = require('chalk');
const boxen = require('boxen');
const fs = require('fs');
const arg = require('arg');
const pkg = require('../package');

const port = process.env.PORT || 3000;

const getNetworkAddress = () => {
	for (const name of Object.keys(interfaces)) {
		for (const interface of interfaces[name]) {
			const {address, family, internal} = interface;
			if (family === 'IPv4' && !internal) {
				return address;
			}
		}
	}
};

const getHelp = () => chalk`
  {bold.cyan pixano} - Annotation Application server
  {bold USAGE}
      {bold $} {cyan pixano} --help
      {bold $} {cyan pixano} --version
      {bold $} {cyan pixano} workspace_path
  {bold OPTIONS}
      --help                              Shows this help message
      -v, --version                       Displays the current version of serve
      -d, --debug                         Show debugging information
`;



let args = null;
try {
  args = arg({
    '--help': Boolean,
    '--version': Boolean,
    '--debug': Boolean,
    '-h': '--help',
    '-v': '--version',
    '-d': '--debug',
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (args['--version']) {
  console.log(pkg.version);
  return;
}

if (args['--help']) {
  console.log(getHelp());
  return;
}

if (args._.length > 1) {
  console.error('Please provide one workspace path argument at maximum');
  process.exit(1);
}

const entry = args._.length > 0 ? path.resolve(args._[0]) : '/data/';

// support json encoded bodies
// and set maximal entity request size (default is 100Kb)
app.use(bodyParser.json({limit: '50mb', extended: true}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use('/data/', express.static(entry));
app.use(cookieParser());

if (!fs.existsSync(entry)) {
  console.error('Please enter a valid path for workspace:');
  console.log(getHelp());
  return;
}

// initialize database
initLevel(entry).then(() => {
  app.use(serveStatic(__dirname + '/../build/'));
  // must be imported after leveldb is initialized
  // otherwise imported db value is not consistent with
  // exported db value.
  const router = require(__dirname + '/router');
  app.use('/api/v1', router);
  
  const server = app.listen(port, async () => {
    const details = server.address();
    let localAddress = null;
		let networkAddress = null;

		if (typeof details === 'string') {
			localAddress = details;
		} else if (typeof details === 'object' && details.port) {
			const address = details.address === '::' ? 'localhost' : details.address;
			const ip = getNetworkAddress();

			localAddress = `http://${address}:${details.port}`;
      networkAddress = `http://${ip}:${details.port}`;
      
      let message = chalk.green('Serving', entry);

			if (localAddress) {
				const prefix = networkAddress ? '- ' : '';
				const space = networkAddress ? '            ' : '  ';

				message += `\n\n${chalk.bold(`${prefix}Local:`)}${space}${localAddress}`;
			}

			if (networkAddress) {
				message += `\n${chalk.bold('- On Your Network:')}  ${networkAddress}`;
			}

      console.log(boxen(message, {
				padding: 1,
				borderColor: 'green',
				margin: 1
			}));
		}
  });

});


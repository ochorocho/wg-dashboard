const express = require("express");
const morgan = require("morgan");
const nunjucks = require("nunjucks");

const dataManager = require("./dataManager");
const wireguardHelper = require("./wgHelper");

exports.initServer = (state, cb) => {
	const app = express();
	app.use(morgan("dev"));
	app.use("/static", express.static("static"));

	app.use(express.json());

	nunjucks.configure(__dirname + "/views", {
		autoescape: true,
		watch: false,
		noCache: true,
		express: app
	});

	app.get("/login", (req, res) => { // main screen
		res.render("login.njk", {});
	});

	app.get("/", (req, res) => {
		res.render("dashboard.njk", {
			ip_address: state.server_config.ip_address,
			cidr: state.server_config.cidr,
			port: state.server_config.port,
			public_key: state.server_config.public_key,
			network_adapter: state.server_config.network_adapter,
			clients: state.server_config.peers,
		});
	});

	app.post("/api/peer", (req, res) => {
		const ids = state.server_config.peers.map((el) => {
			return parseInt(el.id, 10);
		});
		const id = Math.max(...ids) + 1;

		wireguardHelper.generateKeyPair((err, data) => {
			if (err) {
				console.error(err);
				res.status(500).send({
					msg: "COULD_NOT_CREATE_KEYPAIR",
				});
			}

			state.server_config.peers.push({
				id,
				device: "",
				allowed_ips: "",
				public_key: data.public_key,
				private_key: data.private_key,
				active: true,
			});

			dataManager.saveServerConfig(state.server_config, (err) => {
				if (err) {
					console.error("POST /api/peer COULD_NOT_SAVE_SERVER_CONFIG", err);
					res.status(500).send({
						msg: "COULD_NOT_SAVE_SERVER_CONFIG",
					});
					return;
				}

				res.status(201).send({
					msg: "OK",
					id,
					public_key: data.public_key,
				});
			});
		});
	});

	app.put("/api/peer/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(404).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const item = state.server_config.peers.find(el => parseInt(el.id, 10) === parseInt(id, 10));

		if (!item) {
			res.status(404).send({
				msg: "PEER_NOT_FOUND",
			});
			return;
		}

		let validIPs = true;
		const _allowedIPs = req.body.allowed_ips.replace(/ /g, "").split(",");
		_allowedIPs.forEach((e) => {
			const match = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$/.test(e);
			if (!match) {
				validIPs = false;
			}
		});

		if (!validIPs) {
			res.status(500).send({
				msg: "INVALID_IP_SETUP",
			});
			return;
		}

		item.device = req.body.device;
		item.allowed_ips = req.body.allowed_ips.replace(/ /g, "").split(",");
		item.public_key = req.body.public_key;
		item.active = req.body.active;

		dataManager.saveServerConfig(state.server_config, (err) => {
			if (err) {
				console.error("PUT /api/peer/:id COULD_NOT_SAVE_SERVER_CONFIG", err);
				res.status(500).send({
					msg: "COULD_NOT_SAVE_SERVER_CONFIG",
				});
				return;
			}

			res.send({
				msg: "OK",
			});
		});
	});

	app.delete("/api/peer/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(404).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const itemIndex = state.server_config.peers.findIndex(el => parseInt(el.id, 10) === parseInt(id, 10));

		if (itemIndex === -1) {
			res.status(404).send({
				msg: "PEER_NOT_FOUND",
			});
			return;
		}

		state.server_config.peers.splice(itemIndex, 1);

		dataManager.saveServerConfig(state.server_config, (err) => {
			if (err) {
				console.error("DELETE /api/peer/:id COULD_NOT_SAVE_SERVER_CONFIG", err);
				res.status(500).send({
					msg: "COULD_NOT_SAVE_SERVER_CONFIG",
				});
				return;
			}

			res.send({
				msg: "OK",
			});
		});
	});

	app.put("/api/server_settings/save", (req, res) => {
		// const id = req.params.id;

		// if (!id) {
		// 	res.sendStatus(400);
		// 	return;
		// }
		// const data = req.body.data;

		if (!req.body) {
			// TODO: replace sendStatus with json sending functions
			// res.sendStatus(400);
			res.status(400).send({
				msg: "ERROR_INPUT_MISSING",
				missing: "data",
			});
			return;
		}

		// if (!((state.server_config[id] || state.server_config[id] === ""))) {
		// 	res.sendStatus(404);
		// 	return;
		// }

		state.server_config.ip_address = req.body.ip_address;
		state.server_config.port = req.body.port;
		state.server_config.cidr = req.body.cidr;
		state.server_config.private_key = req.body.private_key;
		state.server_config.network_adapter = req.body.network_adapter;

		dataManager.saveServerConfig(state.server_config, (err) => {
			if (err) {
				console.error("PUT /api/server_settings COULD_NOT_SAVE_SERVER_CONFIG", err);
				res.status(500).send({
					msg: "COULD_NOT_SAVE_SERVER_CONFIG",
				});
				return;
			}

			res.send({
				msg: "OK",
			});
		});
	});

	app.get("/api/download/:id", (req, res) => {
		const id = req.params.id;

		if (!id) {
			res.status(400).send({
				msg: "NO_ID_PROVIDED_OR_FOUND",
			});
			return;
		}

		const item = state.server_config.peers.find(el => parseInt(el.id, 10) === parseInt(id, 10));

		if (!item) {
			res.status(404).send({
				msg: "PEER_NOT_FOUND",
			});
			return;
		}

		nunjucks.render("templates/config_client.njk", {
			server_public_key: state.server_config.public_key,
			server_port: state.server_config.port,
			allowed_ips: item.allowed_ips,
			ip_address: state.server_config.ip_address,
			client_private_key: item.private_key,
			server_endpoint: state.server_config.ip_address,
		}, (err, renderedConfig) => {
			if (err) {
				console.error("/api/download/:id", id, item, err);
				res.status(500).send({
					err: "COULD_NOT_RENDER_CLIENT_CONFIG",
				});
				return;
			}

			res.set("Content-disposition", "attachment; filename=client_config_" + id + ".conf");
			res.set("Content-Type", "text/plain");
			res.send(renderedConfig);
		});
	});

	app.get("/api/createwireguardconfig", (req, res) => {
		dataManager.saveWireguardConfig(state, (err) => {
			if (err) {
				res.status(500).send({
					msg: "COULD_NOT_SAVE_WIREGUARD_CONFIG",
				});
				return;
			}

			res.status(201).send({
				msg: "OK",
			});
		});
	});

	app.listen(state.config.port, cb);
}
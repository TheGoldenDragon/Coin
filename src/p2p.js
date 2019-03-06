"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const blockchain_1 = require("./blockchain");
const transactionPool_1 = require("./transactionPool");
const sockets = [];
const peers = [];
let server;
const startupPeerList = ["ws://192.168.1.144:6001"]; //,"ws://192.168.1.163:6001"]; //Fill in 2 real nodes here!!
var MessageType;
(function (MessageType) {
    MessageType[MessageType["QUERY_LATEST"] = 0] = "QUERY_LATEST";
    MessageType[MessageType["QUERY_ALL"] = 1] = "QUERY_ALL";
    MessageType[MessageType["RESPONSE_BLOCKCHAIN"] = 2] = "RESPONSE_BLOCKCHAIN";
    MessageType[MessageType["QUERY_TRANSACTION_POOL"] = 3] = "QUERY_TRANSACTION_POOL";
    MessageType[MessageType["RESPONSE_TRANSACTION_POOL"] = 4] = "RESPONSE_TRANSACTION_POOL";
    MessageType[MessageType["QUERY_PEERS"] = 5] = "QUERY_PEERS";
    MessageType[MessageType["RESPONSE_PEERS_LIST"] = 6] = "RESPONSE_PEERS_LIST";
})(MessageType || (MessageType = {}));
class Message {
}
//Peers can connect to this node through this server.
const initP2PServer = (p2pPort) => {
    server = new WebSocket.Server({ port: p2pPort });
    server.on('connection', (ws, req) => {
        const ip = req.connection.remoteAddress.replace(/^.*:/, '');
        //const port = req.connection.remotePort;
        if (ip != req.connection.localAddress.replace(/^.*:/, '')) {
            acceptConnection(ws);
            if (ip != null && ip != undefined && !IsPeerInList("ws://" + ip + ":" + p2pPort)) {
                console.log("Connecting ip: ws://" + ip + ":" + p2pPort);
                console.log("Try connect to this ip....");
                connectToPeer("ws://" + ip + ":" + p2pPort);
            }
        }
    });
    console.log('Listening websocket p2p port on: ' + p2pPort);
    startupPeerList.forEach(address => {
        console.log('Connecting to peer: ' + address);
        connectToPeer(address);
    });
};
exports.initP2PServer = initP2PServer;
const getSockets = () => sockets;
exports.getSockets = getSockets;
const getPeers = () => peers.filter(notEmpty);
exports.getPeers = getPeers;
const acceptConnection = (ws) => {
    openConnection(ws);
    ws.on('message', (data) => handleMessage(ws, data));
    ws.on('close', () => closeConnection(ws, "closed"));
    ws.on('error', () => closeConnection(ws, "error"));
};
const openConnection = (ws) => {
    console.log('Opened connection to: ' + ws.url);
    if (ws != null && ws != undefined && !IsSocketInList(ws)) {
        console.log('Opened connection to: ' + ws.url);
        sockets.push(ws);
    }
    if (ws.url != null && ws.url != "null" && ws.url != undefined && !IsPeerInList(ws.url)) {
        peers.push(ws.url);
        console.log("Added peer " + ws.url);
        write(ws, queryPeersMsg());
        broadcast(responsePeerListMsg());
    }
    write(ws, queryChainLengthMsg());
    // query transactions pool only some time after chain query
    setTimeout(() => {
        broadcast(queryTransactionPoolMsg());
    }, 500);
};
const closeConnection = (myWs, trigger) => {
    console.log('Connection ' + trigger + ' with peer: ' + myWs.url);
    sockets.splice(sockets.indexOf(myWs), 1);
    peers.splice(peers.indexOf(myWs.url), 1);
    if (peers.length == 0) {
        startupPeerList.forEach(address => {
            console.log('Trying to connect node to: ' + address);
            connectToPeer(address);
        });
    }
};
const handleMessage = (ws, data) => {
    try {
        const message = JSONToObject(data);
        if (message === null) {
            console.log('Could not parse received JSON message: ' + data);
            return;
        }
        console.log('Received: %s', JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                const receivedBlocks = JSONToObject(message.data);
                if (receivedBlocks === null) {
                    console.log('invalid blocks received: %s', JSON.stringify(message.data));
                    break;
                }
                handleBlockchainResponse(receivedBlocks);
                break;
            case MessageType.QUERY_TRANSACTION_POOL:
                write(ws, responseTransactionPoolMsg());
                break;
            case MessageType.RESPONSE_TRANSACTION_POOL:
                const receivedTransactions = JSONToObject(message.data);
                if (receivedTransactions === null) {
                    console.log('Invalid transaction received: %s', JSON.stringify(message.data));
                    break;
                }
                if (receivedTransactions.length == 0) {
                    //console.log('No transactions to handle')
                    break;
                }
                receivedTransactions.forEach((transaction) => {
                    try {
                        blockchain_1.handleReceivedTransaction(transaction);
                        // if no error is thrown, transaction was indeed added to the pool
                        // let's broadcast transaction pool
                        broadCastTransactionPool();
                    }
                    catch (e) {
                        console.log(e.message);
                    }
                });
                break;
            case MessageType.QUERY_PEERS:
                write(ws, responsePeerListMsg());
                console.log("Send peers list to: " + ws.url);
                break;
            case MessageType.RESPONSE_PEERS_LIST:
                const receivedPeersFiltered = JSONToObject(message.data).filter(notEmpty);
                console.log("Filtered received peers: " + receivedPeersFiltered);
                if (receivedPeersFiltered.length == 0) {
                    console.log("Received peer list is empty. Asking all other peers to send their list.");
                    broadcast(queryPeersMsg());
                    return;
                }
                receivedPeersFiltered.forEach(newPeer => {
                    if (!IsPeerInList(newPeer)) {
                        connectToPeer(newPeer);
                    }
                });
                break;
        }
    }
    catch (e) {
        console.log(e);
    }
};
function notEmpty(value) {
    return value !== null && value !== undefined;
}
const JSONToObject = (data) => {
    try {
        return JSON.parse(data);
    }
    catch (e) {
        console.log(e);
        return null;
    }
};
const write = (ws, message) => ws.send(JSON.stringify(message)); //Send message to socket
const broadcast = (message) => sockets.forEach((socket) => write(socket, message)); //Send message to all connected sockets
const broadcastLatest = () => { broadcast(responseLatestMsg()); };
exports.broadcastLatest = broadcastLatest;
const broadCastTransactionPool = () => { broadcast(responseTransactionPoolMsg()); };
exports.broadCastTransactionPool = broadCastTransactionPool;
const queryChainLengthMsg = () => ({ 'type': MessageType.QUERY_LATEST, 'data': null });
const queryAllMsg = () => ({ 'type': MessageType.QUERY_ALL, 'data': null });
const responseChainMsg = () => ({ 'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain_1.getBlockchain()) });
const responseLatestMsg = () => ({ 'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify([blockchain_1.getLatestBlock()]) });
const queryTransactionPoolMsg = () => ({ 'type': MessageType.QUERY_TRANSACTION_POOL, 'data': null });
const responseTransactionPoolMsg = () => ({ 'type': MessageType.RESPONSE_TRANSACTION_POOL, 'data': JSON.stringify(transactionPool_1.getTransactionPool()) });
const queryPeersMsg = () => ({ 'type': MessageType.QUERY_PEERS, 'data': null });
const responsePeerListMsg = () => ({ 'type': MessageType.RESPONSE_PEERS_LIST, 'data': JSON.stringify(peers) });
const handleBlockchainResponse = (receivedBlocks) => {
    if (receivedBlocks.length === 0) {
        console.log('Received block chain size of 0');
        return;
    }
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    if (!blockchain_1.isValidBlockStructure(latestBlockReceived)) {
        console.log('Block structuture not valid');
        return;
    }
    const latestBlockHeld = blockchain_1.getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('Blockchain possibly behind. We got: '
            + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            if (blockchain_1.addBlockToChain(latestBlockReceived)) {
                broadcast(responseLatestMsg());
            }
        }
        else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer');
            broadcast(queryAllMsg());
        }
        else {
            console.log('Received blockchain is longer than current blockchain');
            blockchain_1.replaceChain(receivedBlocks);
        }
    }
    else {
        console.log('Received blockchain is not longer than current blockchain. Do nothing');
    }
};
//Check if peer is in the peer list already.
function IsPeerInList(newPeer) {
    let check = false;
    peers.forEach(peer => {
        if (peer == newPeer) {
            check = true;
        }
    });
    return check;
}
//Check if peer is in the peer list already.
function IsSocketInList(newSocket) {
    let check = false;
    sockets.forEach(socket => {
        if (socket.url == newSocket.url) {
            check = true;
        }
    });
    return check;
}
const connectToPeer = (newPeer) => {
    const ws = new WebSocket(newPeer);
    ws.on('open', () => {
        acceptConnection(ws);
    });
    ws.on('error', () => {
        console.log('Failed to connect to: ' + newPeer);
        if (peers.length == 0) {
            startupPeerList.forEach(address => {
                console.log('Trying to connect node to: ' + address);
                connectToPeer(address);
            });
        }
    });
};
exports.connectToPeer = connectToPeer;
//# sourceMappingURL=p2p.js.map
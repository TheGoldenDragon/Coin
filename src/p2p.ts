import * as WebSocket from 'ws';
import {Server} from 'ws';
import {
    addBlockToChain, Block, getBlockchain, getLatestBlock, handleReceivedTransaction, isValidBlockStructure,
    replaceChain
} from './blockchain';
import {Transaction} from './transaction';
import {getTransactionPool} from './transactionPool';
import { IncomingMessage } from 'http';

const sockets: WebSocket[] = [];
const peers: string[] = []; 
let server: Server;
const startupPeerList: string[] = ["ws://192.168.1.144:6001"];//,"ws://192.168.1.163:6001"]; //Fill in 2 real nodes here!!

enum MessageType {
    QUERY_LATEST = 0,
    QUERY_ALL = 1,
    RESPONSE_BLOCKCHAIN = 2,
    QUERY_TRANSACTION_POOL = 3,
    RESPONSE_TRANSACTION_POOL = 4,
    QUERY_PEERS = 5,
    RESPONSE_PEERS_LIST = 6
}

class Message {
    public type: MessageType;
    public data: any;
}

//Peers can connect to this node through this server.
const initP2PServer = (p2pPort: number) => {
    server = new WebSocket.Server({port: p2pPort});    
    server.on('connection', (ws: WebSocket, req: IncomingMessage) => {          
        const ip = req.connection.remoteAddress.replace(/^.*:/, '');
        //const port = req.connection.remotePort;
        if(ip != req.connection.localAddress.replace(/^.*:/, '')){
            acceptConnection(ws);
            console.log("Connecting ip: " + ip);
            if(ip != null && ip != undefined && !IsPeerInList(ip+":"+p2pPort)){
                console.log("Try connect to this ip....");
                connectToPeer(ip+":"+p2pPort);
            }
        }
    });

    console.log('Listening websocket p2p port on: ' + p2pPort);   
    startupPeerList.forEach(address => {
        console.log('Connecting to first peer: ' + address);
        connectToPeer(address);
    });     
};

const getSockets = () => sockets;
const getPeers = () => peers.filter(notEmpty);

const acceptConnection = (ws: WebSocket) => {    
    openConnection(ws);    
    ws.on('message', (data: string) => handleMessage(ws, data));
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

const openConnection = (ws: WebSocket) => {
    console.log('Opened connection to: ' + ws.url);
    sockets.push(ws);

    if(ws.url != null && ws.url != "null" && ws.url != undefined && !IsPeerInList(ws.url)){        
        peers.push(ws.url);
        console.log("Added peer " + ws.url);
        write(ws, queryPeersMsg());
    }
           
    
    broadcast(responsePeerListMsg());
    write(ws, queryChainLengthMsg());

    // query transactions pool only some time after chain query
    setTimeout(() => {
        broadcast(queryTransactionPoolMsg());
    }, 500); 
};

const closeConnection = (myWs: WebSocket) => {
        console.log('Connection closed with peer: ' + myWs.url);        
        sockets.splice(sockets.indexOf(myWs), 1);
        peers.splice(peers.indexOf(myWs.url), 1);
        if(server.clients.size == 0 || peers.length == 0){
            startupPeerList.forEach(address => {
                console.log('Trying to connect node to: ' + address);
                connectToPeer(address);
            });       
        }
};

const handleMessage = (ws: WebSocket, data: string) => {
    try {
        const message: Message = JSONToObject<Message>(data);
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
                const receivedBlocks: Block[] = JSONToObject<Block[]>(message.data);
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
                const receivedTransactions: Transaction[] = JSONToObject<Transaction[]>(message.data);
                if (receivedTransactions === null) {
                    console.log('Invalid transaction received: %s', JSON.stringify(message.data));
                    break;
                }
                if(receivedTransactions.length == 0){
                    //console.log('No transactions to handle')
                    break;
                }
                receivedTransactions.forEach((transaction: Transaction) => {
                    try {
                        handleReceivedTransaction(transaction);
                        // if no error is thrown, transaction was indeed added to the pool
                        // let's broadcast transaction pool
                        broadCastTransactionPool();
                    } catch (e) {
                        console.log(e.message);
                    }
                });
                break;
            case MessageType.QUERY_PEERS:                
                write(ws, responsePeerListMsg());
                console.log("Send peers list to: " + ws.url);
                break;
            case MessageType.RESPONSE_PEERS_LIST:                
                const receivedPeersFiltered: string[] = JSONToObject<string[]>(message.data).filter(notEmpty);
                console.log("Filtered received peers: " + receivedPeersFiltered);

                if(receivedPeersFiltered.length == 0){
                    console.log("Received peer list is empty. Asking all other peers to send their list.");
                    broadcast(queryPeersMsg());
                    return
                }
                
                receivedPeersFiltered.forEach(newPeer => {  
                    if(!IsPeerInList(newPeer)) {connectToPeer(newPeer);}
                });
                break;
        }
    } catch (e) {
        console.log(e);
    }
};

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
}

const JSONToObject = <T>(data: string): T => {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.log(e);
        return null;
    }
};

const write = (ws: WebSocket, message: Message): void => ws.send(JSON.stringify(message));  //Send message to socket
const broadcast = (message: Message): void => sockets.forEach((socket) => write(socket, message)); //Send message to all connected sockets
const broadcastLatest = (): void => { broadcast(responseLatestMsg()); };
const broadCastTransactionPool = () => { broadcast(responseTransactionPoolMsg()); };

const queryChainLengthMsg = ():         Message => ({'type': MessageType.QUERY_LATEST, 'data': null});
const queryAllMsg = ():                 Message => ({'type': MessageType.QUERY_ALL, 'data': null});
const responseChainMsg = ():            Message => ({'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())});
const responseLatestMsg = ():           Message => ({'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify([getLatestBlock()])});
const queryTransactionPoolMsg = ():     Message => ({'type': MessageType.QUERY_TRANSACTION_POOL, 'data': null});
const responseTransactionPoolMsg = ():  Message => ({'type': MessageType.RESPONSE_TRANSACTION_POOL, 'data': JSON.stringify(getTransactionPool())});
const queryPeersMsg = ():               Message => ({'type': MessageType.QUERY_PEERS, 'data': null});
const responsePeerListMsg = ():         Message => ({'type': MessageType.RESPONSE_PEERS_LIST, 'data': JSON.stringify(peers)});

const handleBlockchainResponse = (receivedBlocks: Block[]) => {
    if (receivedBlocks.length === 0) {
        console.log('Received block chain size of 0');
        return;
    }
    const latestBlockReceived: Block = receivedBlocks[receivedBlocks.length - 1];
    if (!isValidBlockStructure(latestBlockReceived)) {
        console.log('Block structuture not valid');
        return;
    }
    const latestBlockHeld: Block = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('Blockchain possibly behind. We got: '
            + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            if (addBlockToChain(latestBlockReceived)) {
                broadcast(responseLatestMsg());
            }
        } else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer');
            broadcast(queryAllMsg());
        } else {
            console.log('Received blockchain is longer than current blockchain');
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('Received blockchain is not longer than current blockchain. Do nothing');
    }
};

//Check if peer is in the peer list already.
function IsPeerInList(newPeer){
    let check = false;
    peers.forEach(peer => {
        if(peer == newPeer){
            check = true;
        }
    });
    return check; 
}

const connectToPeer = (newPeer: string): void => {
    const ws: WebSocket = new WebSocket(newPeer);
    ws.on('open', () => { 
        acceptConnection(ws);            
    });
   
    ws.on('error', () => {
        console.log('Failed to connect to: ' + newPeer);
        if(server.clients.size == 0 || peers.length == 0){
            startupPeerList.forEach(address => {
                console.log('Trying to connect node to: ' + address);
                connectToPeer(address);
            });                        
        }
    });     
};

export {connectToPeer, broadcastLatest, broadCastTransactionPool, initP2PServer,getPeers, getSockets};

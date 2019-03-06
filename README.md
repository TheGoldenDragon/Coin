# Coin
P2P Exercise based on Naive Coin https://lhartikk.github.io/

Where in the original project no automatic peer discovery is used. In the original project the peers must be manually added.
I tried to fix this with a startup peer list and several peer messages.

In the p2p.ts (p2p.ts line:14) you can find the startupPeerList. When the node starts it will try to connect to one of the peers from this list.
When a connection is found the node will send a queryPeerMsg() to the new connection (p2p.ts line:75).
It also broadcasts the complete peer list to all other peers that are connected. (p2p.ts line: 76).

When a node receives the queryPeerMsg() it will send the peer list (p2p.ts line: 148).

When a node receives the responsePeerListMsg() it will filter the receivedPeers and check for new peers to connect to. 
If a new peer is discovered the node will try to connect (p2p.ts line:162).

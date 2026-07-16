/// <reference lib="webworker" />

import { expose } from 'comlink';
import { packAndFuseChannels, packFinalEvidence, rankInitialChannels } from './retrieval-ranking';

const api = { rankInitialChannels, packAndFuseChannels, packFinalEvidence };
export type RetrievalRankingApi = typeof api;

expose(api);

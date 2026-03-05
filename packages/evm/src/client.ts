import { Contract, Interface, type Provider, type Signer, type Log, type LogDescription } from 'ethers';

/**
 * Event ABI fragments from Stratum Solidity libraries.
 * These events are emitted by any contract using the Stratum libraries.
 */
export const STRATUM_EVENT_ABIS = [
  // StratumEvents
  'event RecordAdded(bytes32 indexed summaryId, uint128 value, bytes data, bytes32 newHash, uint64 count)',
  // StratumResurrection
  'event ArchiveCreated(bytes32 indexed archiveId, bytes32 merkleRoot, uint64 entryCount)',
  'event EntryRestored(bytes32 indexed archiveId, uint256 indexed entryIndex, bytes leafData)',
  'event BatchRestored(bytes32 indexed archiveId, uint256 count)',
  // StratumExpiry
  'event EntryCreated(bytes32 indexed entryId, address indexed owner, uint128 deposit, uint64 expiresAt)',
  'event EntryExtended(bytes32 indexed entryId, uint64 newExpiresAt, uint128 additionalDeposit)',
  'event EntryCleanedUp(bytes32 indexed entryId, address indexed cleaner, uint128 reward)',
  'event EntryVoluntaryCleanup(bytes32 indexed entryId, address indexed owner, uint128 refund)',
] as const;

/**
 * Ethers Interface for parsing Stratum events from any contract's logs.
 */
export const stratumInterface = new Interface(STRATUM_EVENT_ABIS);

/** Parsed RecordAdded event */
export interface RecordAddedEvent {
  summaryId: string;
  value: bigint;
  data: string;
  newHash: string;
  count: bigint;
}

/** Parsed ArchiveCreated event */
export interface ArchiveCreatedEvent {
  archiveId: string;
  merkleRoot: string;
  entryCount: bigint;
}

/** Parsed EntryRestored event */
export interface EntryRestoredEvent {
  archiveId: string;
  entryIndex: bigint;
  leafData: string;
}

/**
 * Parse Stratum events from raw logs.
 * Works with logs from any contract that uses Stratum libraries.
 */
export function parseStratumLogs(logs: readonly Log[]): LogDescription[] {
  const parsed: LogDescription[] = [];
  for (const log of logs) {
    try {
      const desc = stratumInterface.parseLog({ topics: log.topics as string[], data: log.data });
      if (desc) parsed.push(desc);
    } catch {
      // Not a Stratum event — skip
    }
  }
  return parsed;
}

/**
 * Filter logs for RecordAdded events and parse them.
 */
export function parseRecordAddedLogs(logs: readonly Log[]): RecordAddedEvent[] {
  return parseStratumLogs(logs)
    .filter((desc) => desc.name === 'RecordAdded')
    .map((desc) => ({
      summaryId: desc.args[0] as string,
      value: desc.args[1] as bigint,
      data: desc.args[2] as string,
      newHash: desc.args[3] as string,
      count: desc.args[4] as bigint,
    }));
}

/**
 * Create an ethers.js Contract instance with Stratum event parsing.
 * Pass your contract's full ABI — Stratum events will be included automatically.
 *
 * @param address Contract address
 * @param abi Your contract's ABI (Stratum events are merged in)
 * @param signerOrProvider Signer for writes, Provider for reads
 */
export function createStratumContract(
  address: string,
  abi: readonly string[],
  signerOrProvider: Signer | Provider,
): Contract {
  const mergedAbi = [...new Set([...abi, ...STRATUM_EVENT_ABIS])];
  return new Contract(address, mergedAbi, signerOrProvider);
}

/**
 * Fetch RecordAdded events for a specific summaryId from a contract.
 *
 * @param provider JSON-RPC provider
 * @param contractAddress The contract emitting events
 * @param summaryId Filter by summary ID (or null for all)
 * @param fromBlock Starting block
 * @param toBlock Ending block (default: latest)
 */
export async function fetchRecordAddedEvents(
  provider: Provider,
  contractAddress: string,
  summaryId: string | null,
  fromBlock: number,
  toBlock?: number,
): Promise<RecordAddedEvent[]> {
  const topic0 = stratumInterface.getEvent('RecordAdded')!.topicHash;
  const filter = {
    address: contractAddress,
    topics: summaryId ? [topic0, summaryId] : [topic0],
    fromBlock,
    toBlock: toBlock ?? 'latest',
  };

  const logs = await provider.getLogs(filter);
  return parseRecordAddedLogs(logs);
}

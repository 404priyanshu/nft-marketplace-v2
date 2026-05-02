import type { Address } from "viem";

export const deployment = {
  chainId: 31337,
  myNFT: "0x5fbdb2315678afecb367f032d93f642f64180aa3" as Address,
  marketplace: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512" as Address,
} as const;

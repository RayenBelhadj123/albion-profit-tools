export function applyBasisPointRate(amount: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error("Basis points must be a non-negative integer.");
  }

  return (amount * BigInt(basisPoints)) / 10_000n;
}

export function multiplySilver(price: bigint, quantity: number): bigint {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative integer.");
  }

  return price * BigInt(quantity);
}

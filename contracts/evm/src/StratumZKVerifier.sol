// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StratumZKVerifier
/// @notice On-chain Groth16 verification using BN254 pairing precompiles.
///         Supports single proof and batch settlement verification.
library StratumZKVerifier {
    struct Groth16Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct VerificationKey {
        uint256[2] alpha;
        uint256[2][2] beta;
        uint256[2][2] gamma;
        uint256[2][2] delta;
        uint256[2][] ic; // input commitments, length = numPublicInputs + 1
    }

    // --- Events ---

    event ProofVerified(bytes32 indexed circuitId, bool valid);
    event BatchSettlementVerified(bytes32 oldRoot, bytes32 newRoot, uint256 count, bool valid);

    // --- BN254 curve operations via precompiles ---

    /// @notice Elliptic curve addition (precompile 0x06)
    function ecAdd(uint256[2] memory p1, uint256[2] memory p2) internal view returns (uint256[2] memory r) {
        uint256[4] memory input;
        input[0] = p1[0];
        input[1] = p1[1];
        input[2] = p2[0];
        input[3] = p2[1];

        bool success;
        assembly {
            success := staticcall(gas(), 0x06, input, 0x80, r, 0x40)
        }
        require(success, "StratumZKVerifier: ecAdd failed");
    }

    /// @notice Elliptic curve scalar multiplication (precompile 0x07)
    function ecMul(uint256[2] memory p, uint256 s) internal view returns (uint256[2] memory r) {
        uint256[3] memory input;
        input[0] = p[0];
        input[1] = p[1];
        input[2] = s;

        bool success;
        assembly {
            success := staticcall(gas(), 0x07, input, 0x60, r, 0x40)
        }
        require(success, "StratumZKVerifier: ecMul failed");
    }

    /// @notice Negate a G1 point (flip y coordinate mod p)
    function ecNegate(uint256[2] memory p) internal pure returns (uint256[2] memory) {
        uint256 fieldMod = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        if (p[0] == 0 && p[1] == 0) {
            return p;
        }
        return [p[0], fieldMod - (p[1] % fieldMod)];
    }

    /// @notice Pairing check (precompile 0x08)
    /// @dev Returns true if the pairing equation holds
    function ecPairing(uint256[] memory input) internal view returns (bool) {
        uint256 inputLen = input.length;
        uint256[1] memory result;
        bool success;
        assembly {
            success := staticcall(
                gas(),
                0x08,
                add(input, 0x20),
                mul(inputLen, 0x20),
                result,
                0x20
            )
        }
        require(success, "StratumZKVerifier: pairing failed");
        return result[0] == 1;
    }

    // --- Groth16 verification ---

    /// @notice Verify a Groth16 proof against a verification key and public inputs
    /// @dev Implements: e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
    ///      where vk_x = IC[0] + sum(IC[i+1] * publicInput[i])
    function verifyGroth16(
        Groth16Proof memory proof,
        VerificationKey storage vk,
        uint256[] memory publicInputs
    ) internal view returns (bool) {
        require(publicInputs.length + 1 == vk.ic.length, "StratumZKVerifier: input length mismatch");

        // Compute vk_x = IC[0] + sum(IC[i+1] * input[i])
        uint256[2] memory vk_x = vk.ic[0];

        for (uint256 i = 0; i < publicInputs.length; i++) {
            uint256[2] memory product = ecMul(vk.ic[i + 1], publicInputs[i]);
            vk_x = ecAdd(vk_x, product);
        }

        // Pairing check: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        uint256[] memory pairingInput = new uint256[](24);

        // -A, B
        uint256[2] memory negA = ecNegate(proof.a);
        pairingInput[0] = negA[0];
        pairingInput[1] = negA[1];
        pairingInput[2] = proof.b[0][0];
        pairingInput[3] = proof.b[0][1];
        pairingInput[4] = proof.b[1][0];
        pairingInput[5] = proof.b[1][1];

        // alpha, beta
        pairingInput[6] = vk.alpha[0];
        pairingInput[7] = vk.alpha[1];
        pairingInput[8] = vk.beta[0][0];
        pairingInput[9] = vk.beta[0][1];
        pairingInput[10] = vk.beta[1][0];
        pairingInput[11] = vk.beta[1][1];

        // vk_x, gamma
        pairingInput[12] = vk_x[0];
        pairingInput[13] = vk_x[1];
        pairingInput[14] = vk.gamma[0][0];
        pairingInput[15] = vk.gamma[0][1];
        pairingInput[16] = vk.gamma[1][0];
        pairingInput[17] = vk.gamma[1][1];

        // C, delta
        pairingInput[18] = proof.c[0];
        pairingInput[19] = proof.c[1];
        pairingInput[20] = vk.delta[0][0];
        pairingInput[21] = vk.delta[0][1];
        pairingInput[22] = vk.delta[1][0];
        pairingInput[23] = vk.delta[1][1];

        return ecPairing(pairingInput);
    }

    /// @notice Verify a batch settlement proof
    /// @dev Public inputs are [uint256(oldRoot), uint256(newRoot), settlementCount]
    function verifyBatchSettlement(
        Groth16Proof memory proof,
        VerificationKey storage vk,
        bytes32 oldRoot,
        bytes32 newRoot,
        uint256 settlementCount
    ) internal returns (bool) {
        uint256[] memory publicInputs = new uint256[](3);
        publicInputs[0] = uint256(oldRoot);
        publicInputs[1] = uint256(newRoot);
        publicInputs[2] = settlementCount;

        bool valid = verifyGroth16(proof, vk, publicInputs);
        emit BatchSettlementVerified(oldRoot, newRoot, settlementCount, valid);
        return valid;
    }
}

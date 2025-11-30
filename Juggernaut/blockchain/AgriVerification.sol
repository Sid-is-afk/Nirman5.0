// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AgriVerification {
    
    // This defines what a "Product" looks like on the blockchain
    struct Product {
        string qrCodeId;      // e.g., "GLS-17329"
        string productName;   // e.g., "GreenLife Seeds"
        string manufacturer;  // e.g., "GreenLife Pvt Ltd"
        string batchNumber;   // e.g., "B-001"
        bool isAuthentic;     // true
        bool exists;          // checks if it is registered
    }

    // This is the database (Key: QR Code -> Value: Product Details)
    mapping(string => Product) public products;

    // 1. REGISTER: This function adds a new product to the blockchain
    function registerProduct(
        string memory _qrCodeId,
        string memory _productName,
        string memory _manufacturer,
        string memory _batchNumber
    ) public {
        // Check if product already exists to prevent duplicates
        require(!products[_qrCodeId].exists, "Product ID already exists on Blockchain!");

        // Save the product data
        products[_qrCodeId] = Product({
            qrCodeId: _qrCodeId,
            productName: _productName,
            manufacturer: _manufacturer,
            batchNumber: _batchNumber,
            isAuthentic: true,
            exists: true
        });
    }

    // 2. VERIFY: This function reads the data (Cost = Free)
    function verifyProduct(string memory _qrCodeId) public view returns (string memory, string memory, string memory, bool) {
        require(products[_qrCodeId].exists, "Product not found on Blockchain");
        
        Product memory p = products[_qrCodeId];
        return (p.productName, p.manufacturer, p.batchNumber, p.isAuthentic);
    }
}
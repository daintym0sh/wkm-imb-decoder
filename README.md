# CSV IMB Decoder

This JS program is an enhancement of the following project: http://bobcodes.weebly.com/imb.html

#

It adds an additional section for decoding a column in a CSV file containing a barcode with following output format:

Barcode_ID|Service|Mailer_ID|Serial_No|ZIP_Code|Delivery_Point

# Running the program

This program can be run by setting up a simple HTTP server using a VS Code extension called Live Server:
* Install VS Code: https://code.visualstudio.com/download
  * Open VS Code in the project root directory 
* Install Live Server Extension: https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer
  * Start server with "Go Live" button in bottom right corner of VS Code (default port is 5500)
* This project incudes a launch.json file used to configure the VS Code debugger. The port value in the URL property must match the port where Live Server is running for the debugger to work properly. 
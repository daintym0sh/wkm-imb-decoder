// USPS "Intelligent Mail Barcode" Decoder
// You may use this code for any purpose, with no restrictions. However,
// there is NO WARRANTY for this code; use it at your own risk. This work
// is released under the Creative Commons Zero License. To view a copy of
// this license, visit http://creativecommons.org/publicdomain/zero/1.0/

// barcode-to-bit permutation
var desc_char = [7,1,9,5,8,0,2,4,6,3,5,8,9,7,3,0,6,1,7,4,6,8,9,2,5,1,7,5,4,3,
8,7,6,0,2,5,4,9,3,0,1,6,8,2,0,4,5,9,6,7,5,2,6,3,8,5,1,9,8,7,4,0,2,6,3];
var desc_bit = [4,1024,4096,32,512,2,32,16,8,512,2048,32,1024,2,64,8,16,2,
1024,1,4,2048,256,64,2,4096,8,256,64,16,16,2048,1,64,2,512,2048,32,8,128,8,
1024,128,2048,256,4,1024,8,32,256,1,8,4096,2048,256,16,32,2,8,1,128,4096,512,
256,1024];
var asc_char = [4,0,2,6,3,5,1,9,8,7,1,2,0,6,4,8,2,9,5,3,0,1,3,7,4,6,8,9,2,0,5,
1,9,4,3,8,6,7,1,2,4,3,9,5,7,8,3,0,2,1,4,0,9,1,7,0,2,4,6,3,7,1,9,5,8];
var asc_bit = [8,1,256,2048,2,4096,256,2048,1024,64,16,4096,4,128,512,64,128,
512,4,256,16,1,4096,128,1024,512,1,128,1024,32,128,512,64,256,4,4096,2,16,4,1,
2,32,16,64,4096,2,1,512,16,128,32,1024,4,64,512,2048,4,4096,64,128,32,2048,1,
8,4];

// build tables of 13-bit codewords
var encode_table = new Array(1365);
var decode_table = new Array(8192);
var fcs_table = new Array(8192);
function build_codewords(bits, low, hi) {
  var fwd, rev, pop, tmp, bit;
  // loop through all possible 13-bit codewords
  for (fwd = 0; fwd < 8192; fwd++) {
    // build reversed codeword and count population of 1-bits
    pop = 0;
    rev = 0;
    tmp = fwd;
    for (bit = 0; bit < 13; bit++) {
      pop += tmp & 1;
      rev = (rev << 1) | (tmp & 1);
      tmp >>= 1;
    }
    if (pop != bits) continue;

    if (fwd == rev) {
      // palindromic codes go at the end of the table
      encode_table[hi] = fwd;
      decode_table[fwd] = hi;
      decode_table[fwd ^ 8191] = hi;
      fcs_table[fwd] = 0;
      fcs_table[fwd ^ 8191] = 1;
      hi--;
    }
    else if (fwd < rev) {
      // add foreward code to front of table
      encode_table[low] = fwd;
      decode_table[fwd] = low;
      decode_table[fwd ^ 8191] = low;
      fcs_table[fwd] = 0;
      fcs_table[fwd ^ 8191] = 1;
      low++;

      // add reversed code to front of table
      encode_table[low] = rev;
      decode_table[rev] = low;
      decode_table[rev ^ 8191] = low;
      fcs_table[rev] = 0;
      fcs_table[rev ^ 8191] = 1;
      low++;
    }
  }
}
build_codewords(5,    0, 1286);
build_codewords(2, 1287, 1364);

function add(num, add) {
  // num is an array of 11-bit words representing a multiple-precision number.
  // add "add" to num.
  var n, x;
  for (n = num.length - 1; n >= 0 && add != 0; n--) {
    x = num[n] + add;
    add = x >> 11;
    num[n] = x & 0x7ff;
  }
}

function muladd(num, mult, add) {
  // num is an array of 11-bit words representing a multiple-precision number.
  // multiply num by "mult" and add "add".
  // assuming 32-bit integers, the largest mult can be without overflowing
  // is about 2**20, approximately one million.
  var n, x;
  for (n = num.length - 1; n >= 0; n--) {
    x = num[n]*mult + add;
    add = x >> 11;
    num[n] = x & 0x7ff;
  }
}

function divmod(num, div) {
  // num is an array of 11-bit words representing a multiple-precision number.
  // divide num by "div" and return remainder.
  // div is limited the same way as mult above.
  var mod = 0;
  var n, x, q, len = num.length;
  for (n = 0; n < len; n++) {
    x = num[n] + (mod << 11);
    num[n] = q = Math.floor(x / div);
    mod = x - q*div;
  }
  return mod;
}

function iszero(num) {
  // num is an array of 11-bit words representing a multiple-precision number.
  // see if num is zero.
  var n;
  for (n = num.length - 1; n >= 0; n--)
    if (num[n] != 0)
      return false;
  return true;
}

function calcfcs(num) {
  // calculate 11-bit frame check sequence for an array of 11-bit words.
  var fcs = 0x1f0;
  var n, bit, len = num.length;
  for (n = 0; n < len; n++) {
    fcs ^= num[n];
    for (bit = 0; bit < 11; bit++) {
      fcs <<= 1;
      if (fcs & 0x800) fcs ^= 0xf35;
    }
  }
  return fcs;
}

function clean_str(str) {
  if (str == null) str = '';
  return str.toUpperCase().replace(/\s/g, '');
}

function isdigits(str,n) {
  if (/\D/.exec(str)) return false;
  return !n || str.length == n;
}

function text_to_chars(barcode, strict) {
  // convert barcode text to "characters" by applying bit permutation
  barcode = clean_str(barcode);
  var chars = [0,0,0,0,0,0,0,0,0,0];
  var n;
  for (n = 0; n < 65; n++) {
    switch (barcode.charAt(n)) {
      case 'T':  case 'S':  // track bar
        break;
      case 'D':  // descending bar
        chars[desc_char[n]] |= desc_bit[n];
        break;
      case 'A':  // ascending bar
        chars[asc_char[n]] |= asc_bit[n];
        break;
      case 'F':  // full bar
        chars[desc_char[n]] |= desc_bit[n];
        chars[asc_char[n]] |= asc_bit[n];
        break;
      default:
        if (strict) return null;
    }
  }
  return chars;
}

function chars_to_text(chars) {
  var barcode = "";
  for (n = 0; n < 65; n++) {
    if (chars[desc_char[n]] & desc_bit[n]) {
      if (chars[asc_char[n]] & asc_bit[n])
        barcode += "F";
      else
        barcode += "D";
    }
    else {
      if (chars[asc_char[n]] & asc_bit[n])
        barcode += "A";
      else
        barcode += "T";
    }
  }
  return barcode;
}

function decode_chars(chars) {
  // decode characters to codewords.
  // this is the core of the barcode processing.

  var cw = new Array(10);
  var fcs = 0;
  var n;
  for (n = 0; n < 10; n++) {
    cw[n] = decode_table[chars[n]];
    if (cw[n] === undefined) return null;
    fcs |= fcs_table[chars[n]] << n;
  }

  // codewords valid?
  if (cw[0] > 1317 || cw[9] > 1270) {
    return;
  }
  if (cw[9] & 1) {
    // If the barcode is upside down, cw[9] will always be odd.
    // This is due to properties of the bit permutation and the
    // codeword table.
    return null;
  }
  cw[9] >>= 1;
  if (cw[0] > 658) {
    cw[0] -= 659;
    fcs |= 1 << 10;
  }

  // convert codewords to binary
  var num = [0,0,0,0,0,0,0,0,0,cw[0]];
  for (n = 1; n < 9; n++)
    muladd(num, 1365, cw[n]);
  muladd(num, 636, cw[9]);

  if (calcfcs(num) != fcs) return null;

  // decode tracking information
  var track = new Array(20);
  for (n = 19; n >= 2; n--)
    track[n] = divmod(num, 10);
  track[1] = divmod(num, 5);
  track[0] = divmod(num, 10);

  // decode routing information (zip code, etc)
  var route = new Array(11);
  var pos = 11;
  var sz;
  for (sz = 5; sz >= 2; sz--) {
    if (sz == 3) continue;
    if (iszero(num)) break;
    add(num, -1);
    for (n = 0; n < sz; n++)
      route[--pos] = divmod(num, 10);
  }
  if (sz < 2 && !iszero(num)) return null;

  // finally finished decoding
  inf = new Object();
  inf.barcode_id = track.slice(0,2).join('');
  inf.service_type = track.slice(2,5).join('');
  if (track[5] == 9) {
    inf.mailer_id = track.slice(5,14).join('');
    inf.serial_num = track.slice(14,20).join('');
  }
  else {
    inf.mailer_id = track.slice(5,11).join('');
    inf.serial_num = track.slice(11,20).join('');
  }
  if (pos <= 6) inf.zip = route.slice(pos,pos+5).join('');
  if (pos <= 2) inf.plus4 = route.slice(pos+5,pos+9).join('');
  if (pos == 0) inf.delivery_pt = route.slice(9,11).join('');
  return inf;
}

function try_repair(possible, chars, pos) {
  var p = possible[pos];
  var inf = null, newinf;
  var n, len = p.length;
  for (n = 0; n < len; n++) {
    chars[pos] = p[n];
    if (pos < 9)
      newinf = try_repair(possible, chars, pos+1);
    else {
      newinf = decode_chars(chars);
      if (newinf) {
        newinf.suggest = chars_to_text(chars);
        newinf.message = "Damaged barcode";
      }
    }
    if (newinf) {
      // abort if multiple solutions are found.
      if (inf) return { message: "Invalid barcode" }
      inf = newinf;
    }
  }
  return inf;
}

function repair_chars(chars) {
  var n, c, d, bit;
  var possible = new Array(10);
  var prod = 1;
  for (n = 0; n < 10; n++) {
    possible[n] = new Array();
    c = chars[n];
    if (decode_table[c] === undefined) {
      for (bit = 0; bit < 13; bit++) {
        d = c ^ (1 << bit);
        if (decode_table[d] !== undefined)
          possible[n].push(d);
      }
    }
    else {
      possible[n].push(c);
    }
    // Don't let the number of possible combinations get too high --
    // it will take too long to run, and it won't find a unique
    // solution anyway.
    prod *= possible[n].length;
    if (prod == 0 || prod > 1000) return null;
  }
  var newchars = new Array(10);
  return try_repair(possible, newchars, 0);
}

function flip_barcode(barcode) {
  var flipped = "";
  var n, c;
  for (n = barcode.length - 1; n >= 0; n--) {
    c = barcode.charAt(n);
    if (c == "A")
      flipped += "D";
    else if (c == "D")
      flipped += "A";
    else
      flipped += c;
  }
  return flipped;
}

function repair_barcode(barcode) {
  var pos, n, errs, chars, testcode;

  var longer;
  if (barcode.length == 64)
    longer = true;
  else if (barcode.length == 66)
    longer = false;
  else
    return barcode;

  var best = barcode;
  var besterrs = 5;  // don't try to repair if we can't get more than 5 right

  for (pos = 0; pos < 66; pos++) {
    if (longer)
      testcode = barcode.substring(0, pos) + "X" + barcode.substring(pos);
    else
      testcode = barcode.substring(0, pos) + barcode.substring(pos+1);
    chars = text_to_chars(testcode, false);
    errs = 0;
    for (n = 0; n < 10; n++)
      if (decode_table[chars[n]] === undefined)
        errs++;
    if (errs < besterrs) {
      besterrs = errs;
      best = testcode;
    }
  }

  return best;
}

function find_diffs(str1, str2) {
  var len = Math.min(str1.length, str2.length);
  var diffs = new Array(len);
  var n;
  for (n = 0; n < len; n++)
    diffs[n] = str1.charAt(n) != str2.charAt(n);
  return diffs;
}

function decode_barcode(barcode) {
  var chars, inf;

  barcode = clean_str(barcode);
  if (barcode.length == 65) {
    chars = text_to_chars(barcode, true);
    if (chars) {
      inf = decode_chars(chars);
      if (inf) return inf;  // decoded with no errors
    }
  }

  barcode = repair_barcode(barcode);
  if (barcode.length != 65)
    return { message: "Barcode must be 65 characters long" };

  chars = text_to_chars(barcode, false);
  inf = repair_chars(chars);
  if (inf) {
    if (inf.suggest)
      inf.highlight = find_diffs(barcode, inf.suggest);
    return inf;
  }

  barcode = flip_barcode(barcode);
  chars = text_to_chars(barcode, false);
  inf = repair_chars(chars);
  if (inf && inf.barcode_id) {
    inf.message = "Barcode seems to be upside down";
    return inf;
  }

  return { message: "Invalid barcode" };
}

function check_fields(inf) {
  var field;
  for (field in inf)
    inf[field] = clean_str(inf[field]);

  if (inf.zip != "") {
    if (!isdigits(inf.zip,5))
      return "Zip code must be 5 digits";
  }
  if (inf.plus4 != "") {
    if (inf.zip == "")
      return "Zip code required";
    if (!isdigits(inf.plus4,4))
      return "Zip+4 must be 4 digits";
  }
  if (inf.delivery_pt != "") {
    if (inf.plus4 == "")
      return "Zip+4 required";
    if (!isdigits(inf.delivery_pt,2))
      return "Delivery Point must be 2 digits";
  }

  if (!isdigits(inf.barcode_id,2))
    return "Barcode ID must be 2 digits";
  if (inf.barcode_id.charAt(1) >= "5")
    return "Second digit of Barcode ID must be 0-4";
  if (!isdigits(inf.service_type,3))
    return "Service Type must be 3 digits";
  if (!isdigits(inf.mailer_id) ||
      inf.mailer_id.length != 6 && inf.mailer_id.length != 9)
    return "Mailer ID must be 6 or 9 digits";
  if (!isdigits(inf.serial_num)
      || inf.mailer_id.length + inf.serial_num.length != 15)
    return "Mailer ID and Serial Number together must be 15 digits";

  return null;
}

function encode_fields(inf) {
  var n;
  var num = [0,0,0,0,0,0,0,0,0,0];
  var marker = 0;
  if (inf.zip != "") {
    num[9] = parseInt(inf.zip,10);
    marker += 1;
  }
  if (inf.plus4 != "") {
    muladd(num, 10000, parseInt(inf.plus4,10));
    marker += 100000;
  }
  if (inf.delivery_pt != "") {
    muladd(num, 100, parseInt(inf.delivery_pt,10));
    marker += 1000000000;
  }
  add(num, marker);

  muladd(num, 10, parseInt(inf.barcode_id.charAt(0),10));
  muladd(num, 5, parseInt(inf.barcode_id.charAt(1),10));
  muladd(num, 1000, parseInt(inf.service_type,10));
  if (inf.mailer_id.length == 6) {
    muladd(num, 1000000, parseInt(inf.mailer_id,10));
    muladd(num, 100000, 0);  // multiply in two steps to avoid overflow
    muladd(num, 10000, parseInt(inf.serial_num,10));
  }
  else {
    muladd(num, 10000, 0);
    muladd(num, 100000, parseInt(inf.mailer_id,10));
    muladd(num, 1000000, parseInt(inf.serial_num,10));
  }

  var fcs = calcfcs(num);

  var cw = new Array(10);
  cw[9] = divmod(num, 636) << 1;
  for (n = 8; n > 0; n--)
    cw[n] = divmod(num, 1365);
  cw[0] = (num[8]<<11) | num[9];
  if (fcs & (1 << 10)) cw[0] += 659;

  var chars = new Array(10);
  for (n = 0; n < 10; n++) {
    chars[n] = encode_table[cw[n]];
    if (fcs & (1 << n)) chars[n] ^= 8191;
  }

  return chars_to_text(chars);
}

function show_barcode() {
  var top = document.getElementById('row0').cells;
  var mid = document.getElementById('row1').cells;
  var btm = document.getElementById('row2').cells;
  var barcode = clean_str(document.forms.decode_form.barcode.value);
  var len = barcode.length;
  if (len > 65) len = 65;
  var i;
  for (i = 0; i < len; i++) {
    var j = 2*i;
    switch (barcode.charAt(i)) {
      case 'A':
        top[j].style.backgroundColor = '#000';
        mid[j].style.backgroundColor = '#000';
        btm[j].style.backgroundColor = 'transparent';
        break;
      case 'D':
        top[j].style.backgroundColor = 'transparent';
        mid[j].style.backgroundColor = '#000';
        btm[j].style.backgroundColor = '#000';
        break;
      case 'F':
        top[j].style.backgroundColor = '#000';
        mid[j].style.backgroundColor = '#000';
        btm[j].style.backgroundColor = '#000';
        break;
      case 'T':  case 'S':
        top[j].style.backgroundColor = 'transparent';
        mid[j].style.backgroundColor = '#000';
        btm[j].style.backgroundColor = 'transparent';
        break;
      default:
        top[j].style.backgroundColor = '#f00';
        mid[j].style.backgroundColor = '#f00';
        btm[j].style.backgroundColor = '#f00';
        break;
    }
  }
  for (i = len; i < 65; i++) {
    var j = 2*i;
    top[j].style.backgroundColor = 'transparent';
    mid[j].style.backgroundColor = '#ccc';
    btm[j].style.backgroundColor = 'transparent';
  }

  return barcode.length;
}

function get_zip_url(inf) {
  if (inf.zip && inf.zip.length == 5) {
    if (inf.plus4 && inf.plus4.length == 4) {
      return 'http://www.melissadata.com/lookups/zip4.asp?Zip4='
        + inf.zip + inf.plus4;
    }
    else {
      return 'http://zip4.usps.com/zip4/zcl_3_results.jsp?zip5=' + inf.zip;
    }
  }
  return '';
}

function highlight(str, high) {
  var out = "";
  var n, len = str.length;
  for (n = 0; n < len; n++) {
    if (high[n])
      out += '<font color="red">' + str.charAt(n) + '</font>';
    else
      out += str.charAt(n);
  }
  return out;
}

var barcode_fields = [ "zip", "plus4", "delivery_pt", "barcode_id",
   "service_type", "mailer_id", "serial_num" ];

function do_decode() {
  var i;

  var message_span = document.getElementById("message_span");
  message_span.innerHTML = "";

  var encode_form = document.forms.encode_form;
  for (i = 0; i < barcode_fields.length; i++)
    encode_form[barcode_fields[i]].value = "";

  var decode_form = document.forms.decode_form;
  var inf = decode_barcode(decode_form.barcode.value);

  var msg = "";
  if ("message" in inf)
    msg = inf.message;
  if ("suggest"  in inf) {
    if (msg) msg += "<br>";
    msg += "Suggest replacement:<br>";
    if ("highlight" in inf)
      msg += highlight(inf.suggest, inf.highlight);
    else
      msg += inf.suggest;
  }
  message_span.innerHTML = msg;

  for (i = 0; i < barcode_fields.length; i++) {
    if (barcode_fields[i] in inf)
      encode_form[barcode_fields[i]].value = inf[barcode_fields[i]];
  }

  var lookup = get_zip_url(inf);
  if (lookup) {
    document.getElementById('zip_lookup').innerHTML =
       '<a target="_blank" href="' + lookup + '">Lookup</a>';
  }
  else {
    document.getElementById('zip_lookup').innerHTML = '';
  }
}

function do_encode() {
  var i;

  var message_span = document.getElementById("message_span");
  message_span.innerHTML = "";

  var encode_form = document.forms.encode_form;
  var inf = new Object();
  for (i = 0; i < barcode_fields.length; i++)
    inf[barcode_fields[i]] = encode_form[barcode_fields[i]].value;

  var message = check_fields(inf);
  if (message) {
    message_span.innerHTML = message;
  }
  else {
    document.forms.decode_form.barcode.value = encode_fields(inf);
    show_barcode();
  }
  document.getElementById('zip_lookup').innerHTML = '';
}

function do_update() {
  var len = show_barcode();
  if (len == 65) do_decode();
}
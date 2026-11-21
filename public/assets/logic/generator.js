//webCrypto

const UINT32_RANGE = 0x100000000;

const secureRandom = (max) => {
    if(!Number.isSafeInteger(max) || max <= 0 || max >= UINT32_RANGE) {
        throw new RangeError('max must be an integer from 1 thru 2^32.');
    }
    
    const limit = Math.floor(UINT32_RANGE / max) * max;
    const buf = new Uint32Array(1);

    let value;
    do {
        crypto.getRandomValues(buf);
        value = buf[0];
    } while (value >= limit);

    return value % max;
};


//The Chaos Engine
const enhancePasswd = (length = 14) => {
    if(!Number.isInteger(length) || length < 4){
        throw new RangeError('Password length must be an integer of at least 4.');
    }

  const fullPool = {
      lower : 'abcdefghijklmnopqrstuvwxyz',
      upper : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      numbers : '0123456789',
      special : '~!@#$%^&*_+\\=/|<>?.,;:'
  };

    const allChars = Object.values(fullPool).join('');
    let passwdArry = [];

    for(const pool of Object.values(fullPool)){
        passwdArry.push(pool[secureRandom(pool.length)]);
    }

    while(passwdArry.length < length){
        const randomIndex = secureRandom(allChars.length);
        passwdArry.push(allChars[randomIndex]);
    }


    //Hit a Fisher-Yates Algorithm
    for(let i = passwdArry.length - 1; i > 0; i--){
        const j = secureRandom(i + 1);
        [passwdArry[i], passwdArry[j]] = 
            [passwdArry[j], passwdArry[i]];
    }


    return passwdArry.join('');
}

window.enhancePasswd = enhancePasswd;

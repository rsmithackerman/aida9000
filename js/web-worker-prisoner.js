//web-worker-prisoner.js
importScripts('https://unpkg.com/@tensorflow/tfjs');
tf.setBackend('cpu');

//si usamos web-workers es necesario dejar los pesos en una ruta alcanzable para ellos desde su punto de entrada
const prisoners_url = 'webw_weights/prisoners-weights_manifest.json';

let prisoners_model;


const setup = async () => {
    try {
      prisoners_model = await tf.loadLayersModel(prisoners_url);
    } catch(err) {
      console.error("Can't load model: ", err)
    }
    
    const zeros = tf.zeros([1, 224, 224, 3]);
    // warm-up the model
    console.log("warming up prisoners model");
    prisoners_model.predict(zeros);

    postMessage({ modelIsReady: true});
  }
  
  setup();
  
  onmessage = evt => {
    if (prisoners_model) {
      console.log("prisoners_model cargado");
      predict(evt.data);
    }
  }
  
  const predict = async function(faceImages) {
    console.log(faceImages)
    if(faceImages.length > 0) {
    const scores = tf.tidy(() => {
        return faceImages.map(function(img){
            const face = tf.browser.fromPixels(img);
            const resized_image = tf.reshape(tf.image.resizeBilinear(face, [64, 64]), [-1, 64, 64, 3]);
            const prediction = prisoners_model.predict(resized_image);
            return prediction.dataSync()[0];
            })
    })
    return scores;
    }
  
    postMessage(scores);
  }
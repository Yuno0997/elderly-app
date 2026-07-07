#include <Wire.h>
#include "MAX30105.h"

MAX30105 sensor;

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  Serial.println("Starting MAX30102...");

  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 NOT FOUND!");
    while (1);
  }

  Serial.println("MAX30102 FOUND!");
}

void loop() {
  long ir = sensor.getIR();

  Serial.print("IR Value: ");
  Serial.println(ir);

  if (ir > 50000) {
    Serial.println("Finger Detected");
  } else {
    Serial.println("No Finger");
  }

  delay(500);
}
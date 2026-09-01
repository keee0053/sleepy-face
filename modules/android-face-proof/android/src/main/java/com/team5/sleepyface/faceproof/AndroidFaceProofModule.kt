package com.team5.sleepyface.faceproof

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException

private const val TAG = "AndroidFaceProof"

class AndroidFaceProofModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidFaceProof")

    AsyncFunction("checkFaceProof") { localPhotoUri: String, useAccurateMode: Boolean, promise: Promise ->
      checkFaceProof(localPhotoUri, useAccurateMode, promise)
    }
  }

  private val context: Context?
    get() = appContext.reactContext ?: appContext.currentActivity

  private fun checkFaceProof(localPhotoUri: String, useAccurateMode: Boolean, promise: Promise) {
    val imageUri = parseLocalFileUri(localPhotoUri)

    if (imageUri == null) {
      Log.w(TAG, "invalid-photo: could not parse local file uri '$localPhotoUri'")
      promise.resolve(invalidPhotoResult())
      return
    }

    val appContext = context

    if (appContext == null) {
      Log.w(TAG, "detector-error: no reactContext/currentActivity available")
      promise.resolve(detectorErrorResult())
      return
    }

    val image = try {
      InputImage.fromFilePath(appContext, imageUri)
    } catch (e: IOException) {
      Log.w(TAG, "invalid-photo: IOException reading '$imageUri'", e)
      promise.resolve(invalidPhotoResult())
      return
    } catch (e: RuntimeException) {
      Log.w(TAG, "invalid-photo: RuntimeException reading '$imageUri'", e)
      promise.resolve(invalidPhotoResult())
      return
    }

    val performanceMode = if (useAccurateMode) {
      FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE
    } else {
      FaceDetectorOptions.PERFORMANCE_MODE_FAST
    }

    Log.d(
      TAG,
      "checking face proof: uri=$imageUri width=${image.width} height=${image.height} " +
        "rotation=${image.rotationDegrees} useAccurateMode=$useAccurateMode",
    )

    val detector = FaceDetection.getClient(
      FaceDetectorOptions.Builder()
        .setPerformanceMode(performanceMode)
        .build(),
    )

    detector.process(image)
      .addOnSuccessListener { faces ->
        if (faces.isEmpty()) {
          Log.w(TAG, "no-face-detected: 0 faces found in '$imageUri'")
          promise.resolve(noFaceDetectedResult())
        } else {
          Log.d(TAG, "passed: ${faces.size} face(s) found in '$imageUri'")
          promise.resolve(
            mapOf(
              "faceCount" to faces.size,
              "status" to "passed",
            ),
          )
        }
      }
      .addOnFailureListener { e ->
        Log.e(TAG, "detector-error: ML Kit failed processing '$imageUri'", e)
        promise.resolve(detectorErrorResult())
      }
      .addOnCompleteListener {
        detector.close()
      }
  }

  private fun parseLocalFileUri(localPhotoUri: String): Uri? {
    if (localPhotoUri.isBlank()) {
      return null
    }

    val uri = Uri.parse(localPhotoUri)

    if (uri.scheme != "file" || uri.path.isNullOrBlank()) {
      return null
    }

    return uri
  }

  private fun invalidPhotoResult() = mapOf(
    "reason" to "invalid-photo",
    "status" to "failed",
  )

  private fun detectorErrorResult() = mapOf(
    "reason" to "detector-error",
    "status" to "failed",
  )

  private fun noFaceDetectedResult() = mapOf(
    "faceCount" to 0,
    "reason" to "no-face-detected",
    "status" to "failed",
  )
}

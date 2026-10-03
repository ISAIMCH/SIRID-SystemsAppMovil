import * as ImagePicker from 'expo-image-picker';

// Devuelve la imagen elegida como data URI JPEG, o null si se cancela.
export async function pickImageAsDataUri(aspect: [number, number]) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Se necesita permiso para acceder a tus fotos.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.5,
    base64: true,
  });
  if (result.canceled || !result.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${result.assets[0].base64}`;
}

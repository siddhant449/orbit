import { deleteChallengeHandler, getChallengeHandler, postChallengeHandler } from "@/lib/challenge-api";

export function GET() {
  return getChallengeHandler();
}

export function POST(request: Request) {
  return postChallengeHandler(request);
}

export function DELETE() {
  return deleteChallengeHandler();
}
